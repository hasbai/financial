import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const code = readFileSync(new URL('../../../../auth0/login-claims.js', import.meta.url), 'utf8');
async function claims(role: unknown, audience = 'https://financial.hasbai.xyz/api', user: Record<string, unknown> = {}) {
  const exports: { onExecutePostLogin?: (event: unknown, api: unknown) => Promise<void> } = {};
  runInNewContext(code, { exports });
  const result: Record<string, unknown> = {};
  await exports.onExecutePostLogin!({
    resource_server: { identifier: audience }, authorization: { roles: role },
    connection: { name: 'eastmoney-email' },
    user: { name: '月石', email: 'owner@example.test', email_verified: true, ...user },
  }, { access: { deny: (reason: string) => { throw new Error(reason); } }, accessToken: { setCustomClaim: (key: string, value: unknown) => { result[key] = value; } } });
  return result;
}
it('uses top-level identity fields and keeps application roles as an array', async () => {
  const result = await claims(['member', 'superadmin']);
  expect(result).toEqual({ role: 'superadmin', _roles: ['member', 'superadmin'], username: '月石', email: 'owner@example.test' });
});
it('preserves the separate Zboard audience and its role array', async () => {
  expect(await claims(['member', 'superadmin'], 'https://zboard.hasbai.xyz/api')).toEqual({ role: 'authenticated', _roles: ['member', 'superadmin'], username: '月石', email: 'owner@example.test' });
});
it('keeps ordinary users in the unprivileged authenticated database role', async () => {
  for (const role of [[], ['member'], undefined]) expect((await claims(role)).role).toBe('authenticated');
});
it('rejects blocked accounts and unverified email connections', async () => {
  await expect(claims(['superadmin'], undefined, { blocked: true })).rejects.toThrow('用户被封禁');
  await expect(claims(['superadmin'], undefined, { email_verified: false })).rejects.toThrow('请先验证注册邮箱');
});
it('limits the database administrator role to the shared financial and blog API', async () => {
  for (const audience of ['https://zboard.hasbai.xyz/api', 'https://other.test/api', '']) {
    const result = await claims(['member', 'superadmin'], audience);
    expect(result.role).toBe('authenticated');
    expect(result._roles).toEqual(['member', 'superadmin']);
  }
});
