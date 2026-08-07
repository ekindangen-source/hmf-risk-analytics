import { useEffect, useState } from "react";

function dateTime(value) {
  if (!value) return "Never";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export default function UserManagement({
  apiBase,
  currentUser,
  onClose,
}) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetUser, setResetUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [resettingPassword, setResettingPassword] =
    useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    firstName: "",
    lastName: "",
    email: "",
    role: "user",
    temporaryPassword: "",
    confirmPassword: "",
  });

  async function request(path, options) {
    const response = await fetch(
      `${apiBase}${path}`,
      {
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(options?.headers || {}),
        },
        ...options,
      },
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.error ||
        `Request failed with HTTP ${response.status}`,
      );
    }

    return payload;
  }

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await request("/admin/users");
      setUsers(response.data || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    function closeWithEscape(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeWithEscape);

    return () =>
      window.removeEventListener(
        "keydown",
        closeWithEscape,
      );
  }, [onClose]);

  async function updateUser(user, changes) {
    setUpdatingId(user.id);
    setError("");
    setMessage("");

    try {
      const response = await request(
        `/admin/users/${user.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(changes),
        },
      );

      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? {
                ...item,
                ...response.data,
              }
            : item,
        ),
      );

      setMessage(
        `${user.username} updated successfully`,
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setResettingPassword(true);

    try {
      const response = await request(
        `/admin/users/${resetUser.id}/password`,
        {
          method: "POST",
          body: JSON.stringify({
            newPassword,
          }),
        },
      );

      setMessage(response.message);
      setResetUser(null);
      setNewPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setResettingPassword(false);
    }
  }

  function updateNewUser(field, value) {
    setNewUser((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function closeAddUser() {
    setShowAddUser(false);
    setNewUser({
      username: "",
      firstName: "",
      lastName: "",
      email: "",
      role: "user",
      temporaryPassword: "",
      confirmPassword: "",
    });
  }

  async function createUser(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (
      newUser.temporaryPassword !== newUser.confirmPassword
    ) {
      setError("Temporary passwords do not match");
      return;
    }

    setCreatingUser(true);

    try {
      const response = await request("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username: newUser.username,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          email: newUser.email,
          role: newUser.role,
          temporaryPassword: newUser.temporaryPassword,
        }),
      });

      setUsers((current) =>
        [...current, response.data].sort((left, right) =>
          left.username.localeCompare(right.username),
        ),
      );
      setMessage(
        `${response.data.username} created successfully`,
      );
      closeAddUser();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCreatingUser(false);
    }
  }

  return (
    <div
      className="account-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="account-modal user-management-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-management-title"
      >
        <header className="account-modal-header">
          <div>
            <p className="eyebrow">ADMINISTRATION</p>
            <h2 id="user-management-title">
              User management
            </h2>
            <span>
              Manage dashboard access and permissions
            </span>
          </div>

          <div className="user-management-actions">
            <button
              className="refresh-button"
              onClick={() => {
                setShowAddUser((current) => !current);
                setResetUser(null);
                setError("");
                setMessage("");
              }}
            >
              {showAddUser ? "Close form" : "Add user"}
            </button>

            <button
              className="account-modal-close"
              onClick={onClose}
              aria-label="Close user management"
            >
              ×
            </button>
          </div>
        </header>

        {error && (
          <div className="login-error">{error}</div>
        )}

        {message && (
          <div className="profile-success">{message}</div>
        )}

        {showAddUser && (
          <form
            className="add-user-panel"
            onSubmit={createUser}
          >
            <div className="add-user-heading">
              <p className="eyebrow">NEW ACCOUNT</p>
              <h3>Add user</h3>
              <small>
                Give the temporary password to the user securely.
              </small>
            </div>

            <label>
              Username
              <input
                value={newUser.username}
                minLength="3"
                maxLength="80"
                pattern="[A-Za-z0-9._-]+"
                autoComplete="off"
                onChange={(event) =>
                  updateNewUser("username", event.target.value)
                }
                required
                autoFocus
              />
            </label>

            <label>
              First name
              <input
                value={newUser.firstName}
                maxLength="100"
                onChange={(event) =>
                  updateNewUser("firstName", event.target.value)
                }
                required
              />
            </label>

            <label>
              Last name
              <input
                value={newUser.lastName}
                maxLength="100"
                onChange={(event) =>
                  updateNewUser("lastName", event.target.value)
                }
                required
              />
            </label>

            <label>
              Email
              <input
                type="email"
                value={newUser.email}
                maxLength="254"
                autoComplete="off"
                onChange={(event) =>
                  updateNewUser("email", event.target.value)
                }
                required
              />
            </label>

            <label>
              Role
              <select
                value={newUser.role}
                onChange={(event) =>
                  updateNewUser("role", event.target.value)
                }
              >
                <option value="user">Standard user</option>
                <option value="admin">Administrator</option>
              </select>
            </label>

            <label>
              Temporary password
              <input
                type="password"
                value={newUser.temporaryPassword}
                minLength="12"
                maxLength="200"
                autoComplete="new-password"
                onChange={(event) =>
                  updateNewUser(
                    "temporaryPassword",
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <label>
              Confirm password
              <input
                type="password"
                value={newUser.confirmPassword}
                minLength="12"
                maxLength="200"
                autoComplete="new-password"
                onChange={(event) =>
                  updateNewUser(
                    "confirmPassword",
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <div className="add-user-actions">
              <button type="button" onClick={closeAddUser}>
                Cancel
              </button>
              <button
                className="refresh-button"
                type="submit"
                disabled={creatingUser}
              >
                {creatingUser ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        )}

        {resetUser && (
          <form
            className="password-reset-panel"
            onSubmit={resetPassword}
          >
            <div>
              <p className="eyebrow">PASSWORD RESET</p>
              <h3>{resetUser.username}</h3>
              <small>
                Existing sessions will be signed out immediately.
              </small>
            </div>

            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                minLength="12"
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                required
                autoFocus
              />
            </label>

            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                minLength="12"
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                required
              />
            </label>

            <div className="password-reset-actions">
              <button
                type="button"
                onClick={() => {
                  setResetUser(null);
                  setNewPassword("");
                  setConfirmPassword("");
                }}
              >
                Cancel
              </button>

              <button
                className="refresh-button"
                type="submit"
                disabled={resettingPassword}
              >
                {resettingPassword
                  ? "Resetting…"
                  : "Set password"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="account-modal-loading">
            <div className="spinner" />
            <p>Loading users…</p>
          </div>
        ) : (
          <div className="table-wrap account-detail-table">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Password</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user) => {
                  const isSelf =
                    String(user.id) ===
                    String(currentUser.id);

                  return (
                    <tr key={user.id}>
                      <td>
                        <strong>{user.username}</strong>
                        {isSelf && (
                          <small className="self-label">
                            You
                          </small>
                        )}
                      </td>

                      <td>
                        {[user.first_name, user.last_name]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>

                      <td>{user.email || "—"}</td>

                      <td>
                        <select
                          className="user-control"
                          value={user.role}
                          disabled={
                            isSelf ||
                            updatingId === user.id
                          }
                          onChange={(event) =>
                            updateUser(user, {
                              role: event.target.value,
                            })
                          }
                        >
                          <option value="admin">
                            Administrator
                          </option>
                          <option value="user">
                            Standard user
                          </option>
                        </select>
                      </td>

                      <td>
                        <button
                          className={
                            user.is_active
                              ? "status-button active"
                              : "status-button inactive"
                          }
                          disabled={
                            isSelf ||
                            updatingId === user.id
                          }
                          onClick={() =>
                            updateUser(user, {
                              isActive: !user.is_active,
                            })
                          }
                        >
                          {updatingId === user.id
                            ? "Saving…"
                            : user.is_active
                              ? "Active"
                              : "Inactive"}
                        </button>
                      </td>

                      <td>{dateTime(user.last_login_at)}</td>

                      <td>
                        <button
                          className="reset-password-button"
                          disabled={isSelf}
                          title={
                            isSelf
                              ? "Use your Profile to change your password"
                              : "Set a new password"
                          }
                          onClick={() => {
                            setResetUser(user);
                            setNewPassword("");
                            setConfirmPassword("");
                            setError("");
                            setMessage("");
                          }}
                        >
                          Set password
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
