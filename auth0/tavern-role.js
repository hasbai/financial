/** Dedicated Tavern access; existing application claims stay unchanged. */
exports.onExecutePostLogin = async (event, api) => {
  if (event.resource_server?.identifier !== "https://tavern.hasbai.xyz/api") return;
  const username = [event.user.name, event.user.username, event.user.nickname]
    .find(value => typeof value === "string" && value.trim() && value.trim() !== event.user.user_id && value.trim().length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value));
  if (username) api.accessToken.setCustomClaim("https://tavern.hasbai.xyz/username", username.trim());
  if (event.authorization?.roles?.includes("superadmin"))
    api.accessToken.setCustomClaim("https://tavern.hasbai.xyz/role", "superadmin");
};
