const prs = require('./pr_review_context.json');
const prNum = parseInt(process.argv[2], 10);
const pr = prs.find(p => p.number === prNum);
if (!pr) {
  console.log(`PR #${prNum} not found.`);
  process.exit(1);
}
console.log(`=== PR #${pr.number}: ${pr.title} ===`);
console.log(`Author: ${pr.author.login}`);
console.log(`Body:\n${pr.body}\n`);
console.log(`=== Diff (Length: ${pr.diff.length}) ===`);
console.log(pr.diff);
