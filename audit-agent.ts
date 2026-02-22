import { z } from "zod";
import { CopilotClient, defineTool } from "@github/copilot-sdk";

// ── Mock ERP-data ──────────────────────────────────────────────
const clients: Record<string, {
	name: string;
	cvr: string;
	industry: string;
	contact: string;
	revenue2024: number;
	revenue2023: number;
	employees: number;
	auditor: string;
}> = {
	"10042": {
		name: "Hansen & Co ApS",
		cvr: "12345678",
		industry: "Detailhandel",
		contact: "Jens Hansen",
		revenue2024: 4_200_000,
		revenue2023: 3_800_000,
		employees: 12,
		auditor: "Maria Christensen",
	},
	"10078": {
		name: "Nordic Parts A/S",
		cvr: "87654321",
		industry: "Produktion",
		contact: "Lars Petersen",
		revenue2024: 18_500_000,
		revenue2023: 21_000_000,
		employees: 45,
		auditor: "Thomas Andersen",
	},
	"10103": {
		name: "GreenTech Solutions IVS",
		cvr: "11223344",
		industry: "CleanTech",
		contact: "Sofie Grøn",
		revenue2024: 950_000,
		revenue2023: 870_000,
		employees: 3,
		auditor: "Maria Christensen",
	},
	"10156": {
		name: "Dansk Logistik Group A/S",
		cvr: "55667788",
		industry: "Transport & Logistik",
		contact: "Peter Mogensen",
		revenue2024: 52_000_000,
		revenue2023: 48_700_000,
		employees: 120,
		auditor: "Thomas Andersen",
	},
	"10201": {
		name: "ByteWave Digital ApS",
		cvr: "99887766",
		industry: "IT & Software",
		contact: "Mette Skov",
		revenue2024: 8_100_000,
		revenue2023: 12_300_000,
		employees: 22,
		auditor: "Maria Christensen",
	},
};

const riskFactors: Record<string, string[]> = {
	"10042": ["Ny bogholderisystem implementeret i 2024", "Ejer har personlig kaution for banklån"],
	"10078": ["Omsætningsfald >10%", "Stor varebeholdning ift. omsætning", "Vigtig kunde mistet i Q3 2024"],
	"10103": ["Selskab under 3 år", "Afhængig af én kundekontrakt (78% af omsætning)"],
	"10156": ["Kompleks koncernstruktur (3 datterselskaber)", "Verserende skattesag fra 2023"],
	"10201": ["Omsætningsfald >30%", "Negativ egenkapital", "Ledelsesudskiftning i 2024", "Going concern risiko"],
};

const memos: string[] = [];

// ── Copilot Client ─────────────────────────────────────────────
const client = new CopilotClient();
const session = await client.createSession({
	model: "gpt-4.1",
	streaming: true,
	systemMessage: {
		content: `Du er en senior revisionsassistent hos Beierholm. Du hjælper revisorer med at:
- Slå kunder op og analysere nøgletal
- Identificere og vurdere risikofaktorer
- Udarbejde professionelle revisionsnotater

Du har adgang til følgende tools:
- list_clients: Vis alle kunder (valgfrit filtreret på revisor)
- lookup_client: Hent detaljeret kundedata
- flag_risks: Hent risikofaktorer for en kunde
- generate_memo: Generer og gem et revisionsnotat

Arbejdsgang: Når du bliver bedt om at analysere en kunde, brug ALLE relevante tools
i rækkefølge — hent data, tjek risici, og generer et notat.

Svar altid på dansk. Brug fagtermer fra revisionsbranchen.`,
	},
	tools: [
		defineTool("list_clients", {
			description: "List alle kunder, valgfrit filtreret på ansvarlig revisor",
			parameters: z.object({
				auditor: z.string().optional().describe("Filtrér på revisornavn, f.eks. 'Maria Christensen'"),
			}),
			handler: async ({ auditor }) => {
				const list = Object.entries(clients)
					.filter(([_, c]) => !auditor || c.auditor.toLowerCase().includes(auditor.toLowerCase()))
					.map(([id, c]) => ({
						clientId: id,
						name: c.name,
						industry: c.industry,
						auditor: c.auditor,
						revenue2024: c.revenue2024,
					}));
				return { count: list.length, clients: list };
			},
		}),

		defineTool("lookup_client", {
			description: "Hent detaljeret kundedata fra ERP inkl. nøgletal og ændringer",
			parameters: z.object({
				clientId: z.string().describe("Kundenummer, f.eks. 10042"),
			}),
			handler: async ({ clientId }) => {
				const data = clients[clientId];
				if (!data) return { error: `Kunde ${clientId} ikke fundet` };
				const revenueChange = ((data.revenue2024 - data.revenue2023) / data.revenue2023 * 100).toFixed(1);
				return {
					...data,
					revenueChange: `${revenueChange}%`,
					revenueFlag: Math.abs(parseFloat(revenueChange)) > 10 ? "⚠️ VÆSENTLIG AFVIGELSE" : "✅ OK",
				};
			},
		}),

		defineTool("flag_risks", {
			description: "Hent kendte risikofaktorer for en kunde fra risk-databasen",
			parameters: z.object({
				clientId: z.string().describe("Kundenummer"),
			}),
			handler: async ({ clientId }) => {
				const risks = riskFactors[clientId];
				if (!risks) return { clientId, riskLevel: "Lav", factors: [] };
				const riskLevel = risks.length >= 3 ? "Høj" : risks.length >= 2 ? "Mellem" : "Lav";
				return { clientId, riskLevel, factorCount: risks.length, factors: risks };
			},
		}),

		defineTool("generate_memo", {
			description: "Generer og gem et revisionsnotat baseret på analyse",
			parameters: z.object({
				clientId: z.string().describe("Kundenummer"),
				clientName: z.string().describe("Kundenavn"),
				summary: z.string().describe("Kort opsummering af findings"),
				riskLevel: z.string().describe("Risikoniveau: Lav, Mellem eller Høj"),
				recommendations: z.string().describe("Anbefalinger til revisionsteamet"),
			}),
			handler: async ({ clientId, clientName, summary, riskLevel, recommendations }) => {
				const memo = {
					id: `MEMO-2026-${String(memos.length + 1).padStart(3, "0")}`,
					date: new Date().toISOString().split("T")[0],
					clientId,
					clientName,
					summary,
					riskLevel,
					recommendations,
				};
				memos.push(JSON.stringify(memo, null, 2));
				return { success: true, memoId: memo.id, message: `Notat ${memo.id} gemt.` };
			},
		}),
	],
});

// ── Stream output ──────────────────────────────────────────────
session.on("assistant.message_delta", (event) => {
	process.stdout.write(event.data.deltaContent);
});
session.on("session.idle", () => {
	console.log("\n");
});

// ── Kør agenten ────────────────────────────────────────────────
const prompt = process.argv[2] || "Giv mig et overblik over Maria Christensens kunder, analysér dem alle, og lav revisionsnotater for dem der har høj eller mellem risiko.";

console.log(`\n🔍 Prompt: ${prompt}\n${"─".repeat(60)}\n`);

await session.sendAndWait({ prompt });

// Vis gemte notater
if (memos.length > 0) {
	console.log(`\n${"─".repeat(60)}`);
	console.log(`📋 ${memos.length} revisionsnotat(er) gemt:\n`);
	memos.forEach((m) => console.log(m));
}

await client.stop();
process.exit(0);