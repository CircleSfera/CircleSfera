// A browser lets a page open a tab only while it answers a tap. A link that
// has to be asked from the server first arrives too late: phones refuse the
// tab then, and say nothing. So the tab is opened empty at the tap and sent
// to the address when it arrives.

// Opens the empty tab. Call it in the tap handler, before anything waits.
export function openPendingTab(): Window | null {
  return window.open('', '_blank');
}

// Sends the tab to its address. Where the tab could not be opened (a
// browser that refuses even this, or an app that has no tabs), the page
// itself goes there instead: the link is never lost.
export function sendPendingTab(tab: Window | null, url: string): void {
  if (tab && !tab.closed) {
    // The opened page gets no handle on this one.
    tab.opener = null;
    tab.location.replace(url);
    return;
  }
  window.location.assign(url);
}

// Closes a tab whose address never arrived.
export function dropPendingTab(tab: Window | null): void {
  if (tab && !tab.closed) tab.close();
}
