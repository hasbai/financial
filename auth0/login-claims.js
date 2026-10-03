// Access token claims

const EM_ORGANIZATION_ID = 'org_6yvoRRCkzk3eGkBS';
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.blocked) return api.access.deny('用户被封禁');

  let dbRole = "authenticated";
  let roles = event.authorization?.roles ?? [];
  if (roles.includes("superadmin")) {
    dbRole = "superadmin";
  }
  api.accessToken.setCustomClaim("role", dbRole);
  api.accessToken.setCustomClaim("_roles", roles);
  api.accessToken.setCustomClaim("email", event.user.email);
  api.accessToken.setCustomClaim("username", profileName(event.user));

  if (event.organization?.id === EM_ORGANIZATION_ID) {
    api.accessToken.setCustomClaim('department', event.user.user_metadata?.department);
    api.accessToken.setCustomClaim('picture', event.user.picture);
  };

  if (event.connection?.name?.includes('email') && !event.user.email_verified) {
    return api.access.deny('请先验证注册邮箱，再返回登录');
  };
};

const profileName = (user) => [user.name, user.username, user.nickname].map(v => v?.trim()).find(Boolean);
