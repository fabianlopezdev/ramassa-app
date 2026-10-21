/** One visual owner, with native focus retained separately for cancelled touch previews. */
export function createFieldFocusOwnership(commit: (fieldId: string | null) => void) {
  let focused: string | null = null;
  let preview: string | null = null;
  let visible: string | null = null;

  function show(fieldId: string | null) {
    if (visible === fieldId) return;
    visible = fieldId;
    commit(fieldId);
  }

  function release(fieldId: string) {
    if (focused === fieldId) focused = null;
    if (preview === fieldId) preview = null;
    if (visible === fieldId) show(preview ?? focused);
  }

  return {
    press(fieldId: string) {
      preview = fieldId;
      show(fieldId);
    },
    pressOut(fieldId: string) {
      if (preview !== fieldId) return;
      preview = null;
      show(focused);
    },
    focus(fieldId: string) {
      focused = fieldId;
      if (preview === fieldId) preview = null;
      show(preview ?? fieldId);
    },
    blur: release,
    remove: release,
  };
}
