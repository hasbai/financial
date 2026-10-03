export const authConfig = {
  domain: "hasbai.eu.auth0.com",
  clientId: "mdmD7xvX5yay52SRVZeuIOhGHIa0Wdl2",
  audience: "https://financial.hasbai.xyz/api",
  organization: "org_qR4E7HTZE1Zv10go",
} as const;
export const authClaims = { role: "role", username: "https://hasbai.xyz/username", email: "https://hasbai.xyz/email" } as const;
