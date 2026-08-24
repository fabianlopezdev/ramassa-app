export interface DeploymentEnv {
  readonly EXPO_PUBLIC_SUPABASE_URL: string;
  readonly EXPO_PUBLIC_SUPABASE_ANON_KEY: string;
}

function requiredValue(source: Record<string, string | undefined>, name: keyof DeploymentEnv) {
  const value = source[name]?.trim();
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

export function validateDeploymentEnv(source: Record<string, string | undefined>): DeploymentEnv {
  const supabaseUrl = requiredValue(source, 'EXPO_PUBLIC_SUPABASE_URL');
  const supabasePublicKey = requiredValue(source, 'EXPO_PUBLIC_SUPABASE_ANON_KEY');

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must be a valid URL');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL must use HTTPS for deployment');
  }
  if (parsedUrl.hostname === 'placeholder.supabase.co') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL points to the placeholder project');
  }
  if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL points to a local backend');
  }

  return {
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supabasePublicKey,
  };
}

if (import.meta.main) {
  validateDeploymentEnv(process.env);
  console.log('Hosted Supabase deployment environment is valid.');
}
