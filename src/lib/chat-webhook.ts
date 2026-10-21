import "server-only";

export function chatWebhookUrl() {
  const value = process.env.PC_EOS_REPORT_WEBHOOK_URL;
  if (!value) throw new Error("Set PC_EOS_REPORT_WEBHOOK_URL on the server and restart the app.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("The Google Chat webhook configuration is invalid."); }
  if (url.origin !== "https://chat.googleapis.com" || !/^\/v1\/spaces\/[^/]+\/messages$/.test(url.pathname) || !url.searchParams.get("key") || !url.searchParams.get("token") || url.username || url.password || url.hash) throw new Error("The Google Chat webhook configuration is invalid.");
  return url;
}

export async function sendChatReport(url: URL, messages: string[]) {
  let sent = 0;
  for (const text of messages) {
    if (sent) await new Promise((resolve) => setTimeout(resolve, 1100));
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000), redirect: "error" });
    } catch {
      throw new Error(`Google Chat delivery could not be confirmed. ${sent}/${messages.length} messages confirmed sent. Check Chat before retrying to avoid duplicates.`);
    }
    if (!response.ok) throw new Error(`Google Chat rejected the report (HTTP ${response.status}). ${sent}/${messages.length} messages sent. Check Chat before retrying.`);
    await response.body?.cancel();
    sent++;
  }
  return sent;
}
