export const msalConfig = {
    auth: {
        // These must be provided via .env or build-args
        clientId: import.meta.env.VITE_AZURE_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID || 'common'}`,
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
    },
    system: {
        navigateToLoginRequestUrl: false, // Prevents popup window from loading the app
    }
};

// Scopes for the access token
export const loginRequest = {
    scopes: ['User.Read'],
};

// Silence MSAL logs in production
export const msalRequest = {
    scopes: ['User.Read'],
};
