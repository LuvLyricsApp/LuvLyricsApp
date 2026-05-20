const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'LuvLyricsApp/LuvLyricsApp';

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  } catch (error) {
    console.error(`Error running command: ${cmd}`, error.message);
    return '';
  }
}

function main() {
  console.log(`Fetching open PRs for ${REPO}...`);
  const prsJson = runCmd(`gh pr list --repo ${REPO} --state open --json number,title,author,headRefName,baseRefName,labels,statusCheckRollup,body,changedFiles,additions,deletions`);
  
  if (!prsJson) {
    console.error('Failed to fetch PR list or no open PRs.');
    process.exit(1);
  }

  const prs = JSON.parse(prsJson);
  console.log(`Found ${prs.length} open PRs. Fetching details and diffs...`);

  const detailedPRs = prs.map((pr) => {
    console.log(`- Fetching PR #${pr.number}: ${pr.title}`);
    
    // Fetch detailed view
    const viewOutput = runCmd(`gh pr view ${pr.number} --repo ${REPO}`);
    
    // Fetch diff
    const diffOutput = runCmd(`gh pr diff ${pr.number} --repo ${REPO}`);

    return {
      ...pr,
      viewDetails: viewOutput,
      diff: diffOutput
    };
  });

  const outputPath = path.join(__dirname, 'pr_review_context.json');
  fs.writeFileSync(outputPath, JSON.stringify(detailedPRs, null, 2), 'utf8');
  console.log(`Successfully wrote PR metadata and diffs to ${outputPath}`);
}

main();
