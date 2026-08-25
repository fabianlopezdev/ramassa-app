type LinkingClient = {
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
};

export async function openSupportEmail(email: string, linking: LinkingClient): Promise<boolean> {
  const url = `mailto:${email}`;
  if (!(await linking.canOpenURL(url))) return false;

  await linking.openURL(url);
  return true;
}
