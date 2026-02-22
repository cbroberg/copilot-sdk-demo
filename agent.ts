import { z } from "zod";
import { CopilotClient, defineTool } from "@github/copilot-sdk";

// Simuleret kundedata (i virkeligheden: API-kald til ERP)
const clients = {
	"10042": { name: "Hansen & Co ApS", revenue2024: 4_200_000, revenue2023: 3_800_000, employees: 12 },
	"10078": { name: "Nordic Parts A/S", revenue2024: 18_500_000, revenue2023: 21_000_000, employees: 45 },
	"10103": { name: "GreenTech Solutions IVS", revenue2024: 950_000, revenue2023: 870_000, employees: 3 },
};

const client = new CopilotClient();
const session = await client.createSession({
	model: "claude-sonnet-4.6",
	streaming: true,
	systemMessage: {
		content: `Du er en revisionsassistent hos Beierholm. Du hjælper revisorer med at 
analysere kundedata. Når du får et kundenummer, brug lookup_client til at hente data.
Analysér tallene og flag væsentlige afvigelser (>10% ændring i omsætning).
Svar på dansk.`,
	},
	tools: [
		defineTool("lookup_client", {
			description: "Hent kundedata fra ERP-systemet baseret på kundenummer",
			parameters: z.object({
				clientId: z.string().describe("Kundenummer, f.eks. 10042"),
			}),
			handler: async ({ clientId }) => {
				const data = clients[clientId as keyof typeof clients];
				if (!data) return { error: `Kunde ${clientId} ikke fundet` };
				const change = ((data.revenue2024 - data.revenue2023) / data.revenue2023 * 100).toFixed(1);
				return { ...data, revenueChangePercent: change };
			},
		}),
	],
});

// Stream output
session.on("assistant.message_delta", (event) => {
	process.stdout.write(event.data.deltaContent);
});
session.on("session.idle", () => {
	console.log("\n");
});

await session.sendAndWait({ prompt: "Analysér kunde 10078 og giv mig et kort revisionsnotat" });

await client.stop();
process.exit(0);