import { activeTeam } from "@/lib/team-context";
import { withTeam } from "@/lib/team-context";
import { allowedRequestOrigin } from "@/lib/request-origin";
import { dailyData } from "@/lib/database";
import { today } from "@/lib/daily";
import { buildChatReport } from "@/lib/chat-report";
import { chatWebhookUrl, sendChatReport } from "@/lib/chat-webhook";
import { withQueueLock } from "@/lib/queue-sync";

async function handlePOST(request: Request) {
  if (!allowedRequestOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const result = await withQueueLock(async () => {
      const url = chatWebhookUrl();
      const report = buildChatReport(dailyData(today()), activeTeam().code);
      const messagesSent = await sendChatReport(url, report.messages);
      return { messagesSent, ticketCount: report.ticketCount, clientCount: report.clientCount };
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Never return network errors that might contain the secret webhook URL.
    const message = error instanceof Error && /^(Set PC_EOS_REPORT_WEBHOOK_URL|The Google Chat webhook|Google Chat |A ticket |A queue fetch)/.test(error.message) ? error.message : "Unable to create the report. Check server configuration and saved ticket data.";
    return Response.json({ error: message }, { status: 502 });
  }
}

export const POST = withTeam(handlePOST);
