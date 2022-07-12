import "@polkadot/api-augment"; // Introduced via `@polkadot/api v7.0.1`.

// Required imports
import { LoadConfigFile } from "./utils";
import { CVisualizingSubstrate } from "./CVisualizingSubstrate";

// --------------------------------------------------------------
// --------------------------------------------------------------
async function main() {
  process.on("SIGINT", () => {
    // Ctrl+C pressed
    console.log("");
    process.exit();
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.log("Unhandled Rejection at:", promise, "reason:", reason);
    process.exit();
  });

  const config = LoadConfigFile();
  if (!config) return;

  const chain = process.argv[2] || config.defchain;
  const chainData = config.chains[chain];
  if (!chainData) {
    console.log("Syntax: node build/main.js [chain]");
    const chains = Object.keys(config.chains).join(", ");
    console.log("        with chain in [%s]", chains);
    return;
  }

  const visualizingsubstrate = new CVisualizingSubstrate(chainData, chain);
  await visualizingsubstrate.InitAPI();

  // Create transaction database instance
  console.log(config.filename + chain + ".db");
  visualizingsubstrate.InitDataBase(chain, config.filename + chain + ".db");

  console.log('Press "Ctrl+C" to cancel ...\n');
  await visualizingsubstrate.filterTransactions();
}

main()
  .catch(console.error)
  .finally(() => {
    process.exit();
  });
