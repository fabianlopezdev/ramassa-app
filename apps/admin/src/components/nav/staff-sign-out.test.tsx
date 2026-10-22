/**
 * Every team member signs out from the sidebar (RAPP-615), including the
 * onboarding design role, who never reaches the dashboard.
 */
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, mock, test } from 'bun:test';
import { StaffSignOut } from './staff-sign-out';

test('the sidebar offers sign-out and signs out on a click', async () => {
  const signOut = mock(async () => undefined);
  const view = render(
    <TooltipProvider>
      <SidebarProvider>
        <StaffSignOut onSignOut={signOut} />
      </SidebarProvider>
    </TooltipProvider>,
  );
  const button = view.getByRole('button', { name: 'signOutAction' });
  fireEvent.click(button);
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  expect(view.getByTestId('staff-sign-out')).toBe(button);
});
