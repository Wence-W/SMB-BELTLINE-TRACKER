import { Password } from "@convex-dev/auth/providers/Password";
import type { AuthProviderConfig } from "@convex-dev/auth/server";
import { createViktorAuthJsProvider } from "../src/lib/viktor-spaces-access/authjs";
import { ViktorSpacesPasswordReset } from "./ViktorSpacesEmail";
import { configuredProductAuthEnabled } from "./viktorSpaceAuthEnv";

declare const process: { env: Record<string, string | undefined> };

function viktorWorkspaceSignInProviders(): AuthProviderConfig[] {
  const resourceId = process.env.VIKTOR_AUTH_RESOURCE_ID || "";
  const viktorAuthBaseUrl = process.env.VIKTOR_AUTH_BASE_URL || "";
  if (!resourceId || !viktorAuthBaseUrl) {
    // Deployments without a Viktor control plane (local dev) still get
    // email + password auth; "Sign in with Viktor" is simply absent.
    return [];
  }
  return [
    // Hand-rolled Auth.js-style OAuth config; structurally compatible with
    // the provider shape Convex Auth consumes.
    createViktorAuthJsProvider({
      clientId: process.env.VIKTOR_AUTH_CLIENT_ID || `space-${resourceId}`,
      resourceId,
      viktorAuthBaseUrl,
    }) as unknown as AuthProviderConfig,
  ];
}

function configuredSpaceAuthProviders(): AuthProviderConfig[] {
  return [
    Password({
      reset: ViktorSpacesPasswordReset,
    }),
    ...viktorWorkspaceSignInProviders(),
  ];
}

export function configuredAuthProviders(): AuthProviderConfig[] {
  return configuredProductAuthEnabled() ? configuredSpaceAuthProviders() : [];
}
