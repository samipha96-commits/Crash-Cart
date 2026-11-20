import { useState } from "react";
import { useApp } from "../lib/app-context";
import * as api from "../lib/api";
import { ADMIN_GRANTABLE, ALL_WARDS, ROLES, ROLE_HELP, ROLE_LABEL, SINGLE_WARD, can } from "../lib/catalog";
import type { Cart, Role } from "../lib/types";
import { Icon } from "../components/icons";
import { Field, Sheet } from "../components/ui";

/** "All wards" or the ward names. */
function wardText(ids: string[], carts: Cart[], role: Role): string {
  if (role === "hospital_admin" || role === "pharmacy" || role === "nurse") {
    if (!ids.length) return "All wards";
    const names = ids.map((id) => carts.find((c) => c.id === id)?.location ?? "a ward you can't see");
    return names.join(", ");
  }
  return "All wards";
}

export function TeamPage() {
  const { data, ws, backend, run } = useApp();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<{ id: string; email: string; role: Role; ward_ids: string[] } | null>(null);
  const p = data.perm;
  const grantable = can.grantableRoles(p);
  const allScope = p.isSuper || p.wardIds.length === 0;

  /** The Super admin manages everyone; a Hospital admin manages nurses and pharmacists of their wards. */
  const manages = (role: Role, wardIds: string[]) =>
    p.isSuper ||
    (p.role === "hospital_admin" && ADMIN_GRANTABLE.includes(role) && (allScope || (wardIds.length > 0 && wardIds.every((w) => p.wardIds.includes(w)))));

  // The Staff tab is only for the Super admin and Hospital admins.
  if (!can.manageStaff(p))
    return (
      <div className="page">
        <div className="card">
          <div className="empty">Staff IDs are managed by your Hospital admin.</div>
        </div>
      </div>
    );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{p.isSuper ? "Staff & rights" : "Staff"}</h1>
          <p>
            {p.isSuper
              ? `Create IDs for ${data.hospital.name}: Hospital admins (for some or all wards), managers, nurses and pharmacists.`
              : p.role === "hospital_admin"
                ? "Create nurse IDs (one ward each) and pharmacist IDs (all or some of your wards)."
                : `Who uses Crash Cart at ${data.hospital.name}. Your Hospital admin manages IDs.`}
          </p>
        </div>
        {grantable.length > 0 && (
          <button className="btn primary" onClick={() => setInviting(true)}>
            <Icon.plus /> New ID
          </button>
        )}
      </div>

      <div className="card list">
        {data.members.length === 0 && <div className="empty">No staff yet.{p.isSuper ? " Create the Hospital admin first." : ""}</div>}
        {data.members.map((m) => (
          <div key={m.id} className="list-item">
            <div className="list-main">
              <div className="t">
                {m.name || m.email} {m.user_id === ws.user.id && <span className="badge">You</span>}
              </div>
              <div className="s">
                {m.email} · {wardText(m.ward_ids, data.carts, m.role)}
              </div>
            </div>
            <span className="badge primary">{ROLE_LABEL[m.role]}</span>
            {m.user_id !== ws.user.id && manages(m.role, m.ward_ids) && (
              <>
                <button className="btn ghost small" onClick={() => setEditing(m)} aria-label={`Change rights of ${m.email}`}>
                  Edit
                </button>
                <button
                  className="btn ghost small danger"
                  aria-label={`Remove ${m.email}`}
                  onClick={() => confirm(`Remove ${m.email} from ${data.hospital.name}?`) && void run(() => api.removeMember(backend, m.id), "Removed")}
                >
                  <Icon.close />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {data.invites.length > 0 && (
        <div className="section">
          <div className="section-title">
            <h2>Waiting to sign in</h2>
          </div>
          <div className="card list">
            {data.invites.map((i) => (
              <div key={i.id} className="list-item">
                <div className="list-main">
                  <div className="t">{i.email}</div>
                  <div className="s">
                    {ROLE_LABEL[i.role]} · {wardText(i.ward_ids, data.carts, i.role)} · joins when they sign in with this email
                  </div>
                </div>
                {manages(i.role, i.ward_ids) && (
                  <button className="btn ghost small" onClick={() => void run(() => api.cancelInvite(backend, i.id), "Cancelled")}>
                    Cancel
                  </button>
                )}
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
          {p.isSuper && (
          <div className="list-item">
            <div className="list-main">
              <div className="t">Super admin</div>
              <div className="s">Creates hospital portals (theme, look, logo) and their wards, and Hospital admin IDs for some or all wards</div>
            </div>
          </div>
          )}
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
      {inviting && <AccessSheet onClose={() => setInviting(false)} />}
      {editing && <AccessSheet member={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccessSheet({ member, onClose }: { member?: { id: string; email: string; role: Role; ward_ids: string[] }; onClose: () => void }) {
  const { data, backend, run, toast } = useApp();
  const p = data.perm;
  const roles = can.grantableRoles(p);
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<Role>(member?.role ?? roles[0]);
  const [wards, setWards] = useState<string[]>(member?.ward_ids ?? []);
  const allScope = p.isSuper || p.wardIds.length === 0;
  // "All wards" is an empty list; only someone who covers every ward can give it.
  const [all, setAll] = useState(member ? member.ward_ids.length === 0 && allScope : allScope);
  const single = SINGLE_WARD.includes(role);
  const fixedAll = ALL_WARDS.includes(role);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const chosen = fixedAll || (!single && all) ? [] : wards;
    if (!fixedAll && !(!single && all) && chosen.length === 0) {
      toast(single ? "Choose the nurse's ward." : "Choose at least one ward, or All wards.", "error");
      return;
    }
    let joined = true;
    const ok = await run(async () => {
      if (member) await api.changeAccess(backend, member.id, role, chosen);
      else joined = (await api.inviteMember(backend, data, email, role, chosen)).joined;
    });
    if (ok) {
      toast(member ? "Rights updated" : joined ? "Rights updated" : `ID created for ${email.trim().toLowerCase()}`);
      onClose();
    }
  }

  return (
    <Sheet title={member ? `Rights of ${member.email}` : "New ID"} onClose={onClose}>
      <form onSubmit={submit}>
        {!member && (
          <>
            <p className="muted small" style={{ marginTop: -6 }}>
              The person signs in (or creates their account) with this email and gets these rights at {data.hospital.name}. Send them the
              app link yourself.
            </p>
            <Field label="Email (their sign-in ID)">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
          </>
        )}
        <Field label="Role">
          <select
            className="input"
            value={role}
            onChange={(e) => {
              const r = e.target.value as Role;
              setRole(r);
              if (SINGLE_WARD.includes(r)) setWards((w) => w.slice(0, 1));
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <p className="muted small" style={{ marginTop: -6 }}>
          {ROLE_HELP[role]}
        </p>

        {fixedAll ? (
          <p className="small">Covers all wards.</p>
        ) : single ? (
          <Field label="Ward">
            <select className="input" value={wards[0] ?? ""} onChange={(e) => setWards(e.target.value ? [e.target.value] : [])} required>
              <option value="">Choose a ward…</option>
              {data.carts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.location} · {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
            <span>Wards</span>
            {allScope && (
              <label className="row small">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All wards (including wards added later)
              </label>
            )}
            {!all &&
              data.carts.map((c) => (
                <label key={c.id} className="row small">
                  <input
                    type="checkbox"
                    checked={wards.includes(c.id)}
                    onChange={(e) => setWards((w) => (e.target.checked ? [...w, c.id] : w.filter((x) => x !== c.id)))}
                  />
                  {c.location} · {c.name}
                </label>
              ))}
            {!all && data.carts.length === 0 && <small className="muted">No wards yet. Add wards first.</small>}
          </fieldset>
        )}
        <button className="btn primary block">{member ? "Save rights" : "Create ID"}</button>
      </form>
    </Sheet>
  );
}
