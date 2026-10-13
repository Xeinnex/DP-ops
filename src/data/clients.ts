import type { Client } from "@/types/ticket";

export const clients: Client[] = [
  { id: "108848", name: "148 COMMUNICATIONS LLC" },
  { id: "107911", name: "7 Eleven International" },
  { id: "22446", name: "Advance Media New York" },
  { id: "104329", name: "ASME" },
  { id: "19604", name: "AssetWorks Inc." },
  { id: "22503", name: "Behavioral Framework" },
  { id: "12042", name: "Branson's Nantucket Resort" },
  { id: "84083", name: "Capital Sales Company" },
  { id: "19155", name: "cfmws" },
  { id: "27883", name: "Crestwood" },
  { id: "89709", name: "Dalen Products" },
  { id: "7789", name: "DecoExchange" },
  { id: "79449", name: "DRAFT" },
  { id: "19381", name: "ERPA" },
  { id: "89100", name: "Forma" },
  { id: "81084", name: "Itel Networks" },
  { id: "588", name: "Jeffrey Williams" },
  { id: "12925", name: "Just Dano" },
  { id: "106444", name: "K12 - Second Account" },
  { id: "91457", name: "KPMG International Limited" },
  { id: "19001", name: "marilyn@powerny.com" },
  { id: "91858", name: "Michael Buffington" },
  { id: "105454", name: "Oregon Farm Bureau Federation" },
  { id: "11183", name: "Rab's Country Lanes" },
  { id: "68723", name: "Refeyn" },
  { id: "108682", name: "Remitian" },
  { id: "58572", name: "Ribble, Inc. Dba Big Chief Creative Media" },
  { id: "27784", name: "Service Management Group" },
  { id: "69053", name: "SoftWave TRT" },
  { id: "64883", name: "Strativia" },
  { id: "8515", name: "Streetz Dance Convention" },
  { id: "18577", name: "TeleTracking" },
  { id: "105787", name: "The Huntington National Bank" },
  { id: "106609", name: "Two Rivers Coffee" },
  { id: "78615", name: "UE Systems" },
  { id: "50619", name: "UsAgainstAlzheimers" },
  { id: "27658", name: "Vantage West Credit Union" },
  { id: "89744", name: "Vystah Inc." },
  { id: "94907", name: "Water For People" },
];

export function clientQueueUrl(id?: string) {
  const url = new URL("https://jar.designpickle.com/admin/tickets");
  if (id) url.searchParams.set("q[company_id_eq]", id);
  else clients.forEach((client) => url.searchParams.append("q[company_id_in][]", client.id));
  url.searchParams.set("q[ticket_status]", "active");
  return url.toString();
}
