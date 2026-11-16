/**
 * La meva assistència (RAPP-794): her attendance history, opened from the
 * profile menu. It stays in the profile because it is data about her.
 */
import { AttendanceHistorySection } from '@/components/profile/attendance-history-section';
import { ProfileScreenFrame } from '@/components/profile/profile-screen-frame';
import { useTranslation } from 'react-i18next';

export default function ProfileAttendanceScreen() {
  const { t } = useTranslation('profile');
  return (
    <ProfileScreenFrame title={t('menu.attendance')} testID="profile-attendance">
      <AttendanceHistorySection />
    </ProfileScreenFrame>
  );
}
