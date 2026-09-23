import { authConfig } from "@hasbai/auth";
import { dataApiUrl } from "@hasbai/data";
// Public browser configuration only; never add secrets here.
export const config = {
  ...authConfig,
  dataApiUrl: import.meta.env.VITE_DATA_API_URL || dataApiUrl,
  ownerSubject: "auth0|6a9e921870e37d7bbfb76c8f",
  schema: "financial",
};
