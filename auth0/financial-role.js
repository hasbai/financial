// Bind to Auth0 Login / Post Login. The API uses this signed claim to select
// the PostgreSQL role; the SPA does not inspect it or implement authorization.
exports.onExecutePostLogin = async (event, api) => {
  if (
    event.resource_server?.identifier === "https://financial.hasbai.xyz/api" &&
    event.authorization?.roles?.includes("superadmin")
  ) {
    api.accessToken.setCustomClaim("role", "superadmin");
  }
  const username = profileName(event.user);
  if (username) api.accessToken.setCustomClaim("https://hasbai.xyz/username", username.trim());
  if (event.user.email_verified && event.user.email)
    api.accessToken.setCustomClaim("https://hasbai.xyz/email", event.user.email);
};

// Shared profile claim for 北极小站. Never filter usernames by Tavern audience.
const profileName = (user) => [user.name, user.username, user.nickname].find(value =>
  typeof value === "string" && value.trim() && value.trim() !== user.user_id &&
  value.trim().length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value));
