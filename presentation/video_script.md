# Demo video script (approved; built in presentation/motion)

Length about 95 s (the rules allow 1 to 2 min). The voice is your ElevenLabs clone. IBM look: Plex type, IBM Blue #0F62FE on white.
"Footage" means a screen recording of the live page at https://yasaswip012.github.io/atomiq-quantum-campaign/. "Motion" means animated type and charts built from the result files.

| Time | Picture | Narration |
|---|---|---|
| 0:00–0:04 | Motion: black-on-white type punches in, "6 calls." then "Which 6?". Ten customer IDs drop in as chips. | A bank can afford six calls for a term-deposit offer. |
| 0:04–0:10 | The chips shuffle and six light up IBM Blue, then "20% chance of 3 sign-ups" counts up. | Most people say no. So which six do you call, and how likely is it that three say yes? |
| 0:10–0:22 | Footage: the live page loads at the hero; the camera pushes into the bitstring and the six highlighted rows. | We built a three-stage Qiskit pipeline that answers both, and we check every quantum number against an exact one. Here's the answer: these six customers, about a one-in-five chance of three or more. |
| 0:22–0:38 | Motion: the kernel-concentration curve draws itself, then the CV table slides in with the LR row highlighted. | Stage one predicts who subscribes. Customers whose last campaign succeeded say yes six times in ten, and our model puts them first. A six-qubit quantum kernel goes flat at default settings, so we tune its bandwidth; with thirty-five positive examples it still doesn't beat logistic regression, and we report that. |
| 0:38–1:00 | Footage: a cursor clicks customers in the live Stage 2 checker; the status goes from "Pick 2 more" to "Feasible · this is the optimum"; then it clicks a QAOA outcome. | Stage two picks the six. The circuit starts in a Dicke state, every valid pick of six at once, and an XY mixer keeps it there, so every shot obeys the rule. The optimum comes out twenty-seven times more often than a guess, with zero gap to brute force. You can check it yourself on the page. |
| 1:00–1:16 | Footage: the Stage 3 sampler. A slider moves, "Draw shots" is pressed, and the histogram fills. Cut to the Stage 3 estimates chart. | Stage three gives each customer one qubit and counts shots with three or more ones. On an IBM Heron noise model, readout mitigation brings the estimate back to the exact value. |
| 1:16–1:28 | Motion: the error-budget bars grow; the model-uncertainty bar dwarfs the rest. Footage: the green CI run. | The biggest uncertainty isn't quantum noise. It's thirty-five positive examples. Every push reruns the whole pipeline on Linux and checks the answer. |
| 1:28–1:35 | End card: "Six customers, one campaign", the page URL, the GitHub URL. | Open the page. No login. |

All numbers come from the committed result files at commit 4fe159d. There are no invented users, quotes or features.
