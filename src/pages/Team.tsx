import { useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { ROLES, ROLE_HELP, ROLE_LABEL, can } from "../lib/catalog";
import type { Role } from "../lib/types";
import { Icon } from "../components/icons";
import { Field, Sheet } from "../components/ui";

export function TeamPage() {
  const { data, ws, backend, run } = useApp();
  const [inviting, setInviting] = useState(false);
  const admin = can.manageHospital(data.role);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p>Who can use Crash Cart at {data.hospital.name}, and what they can do.</p>
        </div>
        {admin && (
          <button className="btn primary" onClick={() => setInviting(true)}>
            <Icon.plus /> Invite staff
          </button>
        )}
      </div>

      <div className="card list">
        {data.members.map((m) => (
          <div key={m.id} className="list-item">
            <div className="list-main">
              <div className="t">
                {m.name || m.email} {m.user_id === ws.user.id && <span className="badge">You</span>}
              </div>
              <div className="s">{m.email}</div>
            </div>
            {admin && m.user_id !== ws.user.id ? (
              <>
                <select
                  className="select-hospital"
                  value={m.role}
                  aria-label={`Role for ${m.email}`}
                  onChange={(e) => void run(() => api.changeRole(backend, m.id, e.target.value as Role), "Role updated")}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <button
                  className="btn ghost small danger"
                  aria-label={`Remove ${m.email}`}
                  onClick={() => confirm(`Remove ${m.email} from ${data.hospital.name}?`) && void run(() => api.removeMember(backend, m.id), "Removed")}
                >
                  <Icon.close />
                </button>
              </>
            ) : (
              <span className="badge primary">{ROLE_LABEL[m.role]}</span>
            )}
          </div>
        ))}
      </div>

      {admin && data.invites.length > 0 && (
        <div className="section">
          <div className="section-title">
            <h2>Waiting to join</h2>
          </div>
          <div className="card list">
            {data.invites.map((i) => (
              <div key={i.id} className="list-item">
                <div className="list-main">
                  <div className="t">{i.email}</div>
                  <div className="s">{ROLE_LABEL[i.role]} · joins when they sign in with this email</div>
                </div>
                <button className="btn ghost small" onClick={() => void run(() => api.cancelInvite(backend, i.id), "Invite cancelled")}>
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-title">
          <h2>Roles</h2>
        </div>
        <div className="card list">
          {ROLES.map((r) => (
            <div key={r} className="list-item">
              <div className="list-main">
                <div className="t">{ROLE_LABEL[r]}</div>
                <div className="s">{ROLE_HELP[r]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {inviting && <InviteSheet onClose={() => setInviting(false)} />}
    </div>
  );
}

function InviteSheet({ onClose }: { onClose: () => void }) {
  const { data, backend, run, toast } = useApp();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("nurse");
  return (
    <Sheet title="Invite staff" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          let joined = false;
          const ok = await run(async () => {
            joined = (await api.inviteMember(backend, data, email, role)).joined;
          });
          if (ok) {
            toast(joined ? "Role updated" : `Invited ${email.trim().toLowerCase()}`);
            onClose();
          }
        }}
      >
        <p className="muted small" style={{ marginTop: -6 }}>
          They join {data.hospital.name} as soon as they sign in or create an account with this email. Send them the app link yourself.
        </p>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </Field>
        <Field label="Role">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}: {ROLE_HELP[r]}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn primary block">Invite</button>
      </form>
    </Sheet>
  );
}
