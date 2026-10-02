import type { ProposalStage } from "@/integrations/supabase/models";

// Shared by the board, calendar, tables and distribution chart.
export const STAGE_STYLE: Record<
  ProposalStage,
  { bg: string; fg: string; dot: string; barText: string }
> = {
  appointment_confirmed: { bg: "#FBE7BF", fg: "#7A4E05", dot: "#F0A81E", barText: "#3D2600" },
  appointment_canceled: { bg: "#F6D6C7", fg: "#7A2E12", dot: "#E07A52", barText: "#3D1405" },
  pricing_review: { bg: "#EDE6F8", fg: "#4B2E83", dot: "#6B46C1", barText: "#FFFFFF" },
  negotiation: { bg: "#E6F1FB", fg: "#0C447C", dot: "#185FA5", barText: "#FFFFFF" },
  no_deal: { bg: "#E6E4DB", fg: "#45443D", dot: "#9C9A90", barText: "#26251F" },
  deal: { bg: "#D3E8BC", fg: "#2C5212", dot: "#5FA13B", barText: "#173404" },
};
