// Public browser configuration only; never add secrets here.
export const config = {
  domain: "hasbai.eu.auth0.com",
  clientId: "mdmD7xvX5yay52SRVZeuIOhGHIa0Wdl2",
  audience: "https://financial.hasbai.xyz/api",
  dataApiUrl:
    import.meta.env.VITE_DATA_API_URL ||
    "https://ep-long-dew-b3q1him6.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1",
  ownerSubject: "auth0|6a9e921870e37d7bbfb76c8f",
  schema: "financial",
};
