/** Dedicated Tavern access; existing application claims stay unchanged. */
exports.onExecutePostLogin = async (event, api) => {
  if (event.resource_server?.identifier !== "https://tavern.hasbai.xyz/api") return;
  if (event.authorization?.roles?.includes("superadmin"))
    api.accessToken.setCustomClaim("https://tavern.hasbai.xyz/role", "superadmin");
};
