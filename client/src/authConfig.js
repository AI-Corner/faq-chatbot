export const msalConfig = {
    auth: {
        // These will be overridden by environment variables or injected at runtime
        clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '00000000-0000-0000-0000-000000000000',
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || 'common'}`,
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
    },
};

// Scopes for the access token
export const loginRequest = {
    scopes: ['User.Read'],
};

// Silence MSAL logs in production
export const msalRequest = {
    scopes: ['User.Read'],
};
