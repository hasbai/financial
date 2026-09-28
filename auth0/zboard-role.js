/** Dedicated audience: never grants financial Data API access. */
exports.onExecutePostLogin = async (event, api) => {
  if (event.resource_server?.identifier !== "https://zboard.hasbai.xyz/api")
    return;
  if (event.authorization?.roles?.includes("superadmin")) {
    api.accessToken.setCustomClaim(
      "https://zboard.hasbai.xyz/role",
      "superadmin",
    );
  }
  if (event.user.email_verified && event.user.email) {
    api.accessToken.setCustomClaim(
      "https://zboard.hasbai.xyz/email",
      event.user.email,
    );
  }
};
