import { useAuthenticatedMediaUrl } from '@/components/content/authenticated-media-image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { mediaWorkerUrl } from '@/lib/media-worker';
import { useAuth } from '@ramassa/shared/auth';

export function PersonAvatar({
  name,
  avatarKey,
}: {
  readonly name: string;
  readonly avatarKey: string | null | undefined;
}) {
  const { session } = useAuth();
  const source = useAuthenticatedMediaUrl(avatarKey ?? null, mediaWorkerUrl, session?.access_token);
  return (
    <Avatar aria-hidden="true" className="size-8 shrink-0">
      {source === null ? null : <AvatarImage src={source} alt="" />}
      <AvatarFallback>{[...name.trim()][0]?.toLocaleUpperCase() ?? ''}</AvatarFallback>
    </Avatar>
  );
}
