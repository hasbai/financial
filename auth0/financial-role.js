// Bind to Auth0 Login / Post Login. The API uses this signed claim to select
// the PostgreSQL role; the SPA does not inspect it or implement authorization.
exports.onExecutePostLogin = async (event, api) => {
  if (
    event.resource_server?.identifier === "https://financial.hasbai.xyz/api" &&
    event.authorization?.roles?.includes("superadmin")
  ) {
    api.accessToken.setCustomClaim("role", "superadmin");
  }
};
