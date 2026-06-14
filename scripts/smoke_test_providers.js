/**
 * Provider Smoke Test Script
 * 
 * Run with: npm run test:providers
 * 
 * Purpose: Validates core provider flows (Lyrica, LRCLIB, JioSaavn) against known fixtures.
 * Helps contributors diagnose provider health and API drift before submitting PRs.
 */

const FIXTURE = {
    artist: "Gracie Abrams",
    track: "I Love You, I'm Sorry",
    duration: 180
};

const providers = [
    {
        name: "Lyrica API (Aggregator)",
        test: async () => {
            const url = `https://test-0k.onrender.com/lyrics/?artist=${encodeURIComponent(FIXTURE.artist)}&song=${encodeURIComponent(FIXTURE.track)}&timestamps=true&fast=false&metadata=true`;
            let res;
            try {
                res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            } catch (err) {
                throw new Error(`Network failure: ${err.message}`);
            }
            if (!res.ok) {
                throw new Error(`Network failure: HTTP ${res.status} ${res.statusText}`);
            }
            let data;
            try {
                data = await res.json();
            } catch (err) {
                throw new Error(`Parsing failure: Invalid JSON response`);
            }
            if (data.status !== 'success' || !data.data) {
                throw new Error("Parsing failure: Missing expected 'data' structure in response");
            }
            if (!data.data.lyrics && !data.data.timestamped && !data.data.timed_lyrics) {
                throw new Error("Parsing failure: No lyrics payload found in response");
            }
        }
    },
    {
        name: "LRCLIB API",
        test: async () => {
            const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(FIXTURE.track)}&artist_name=${encodeURIComponent(FIXTURE.artist)}`;
            let res;
            try {
                res = await fetch(url, { headers: { 'User-Agent': 'LuvLyrics/1.0' } });
            } catch (err) {
                throw new Error(`Network failure: ${err.message}`);
            }
            if (!res.ok) {
                if (res.status === 404) throw new Error("Parsing failure: Track not found in LRCLIB");
                throw new Error(`Network failure: HTTP ${res.status} ${res.statusText}`);
            }
            let data;
            try {
                data = await res.json();
            } catch (err) {
                throw new Error(`Parsing failure: Invalid JSON response`);
            }
            if (!data.syncedLyrics && !data.plainLyrics) {
                throw new Error("Parsing failure: No 'syncedLyrics' or 'plainLyrics' in response");
            }
        }
    },
    {
        name: "JioSaavn API",
        test: async () => {
            const searchUrl = `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(FIXTURE.track)}&limit=1`;
            let res;
            try {
                res = await fetch(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            } catch (err) {
                throw new Error(`Network failure: ${err.message}`);
            }
            if (!res.ok) {
                throw new Error(`Network failure: HTTP ${res.status} ${res.statusText}`);
            }
            let data;
            try {
                data = await res.json();
            } catch (err) {
                throw new Error(`Parsing failure: Invalid JSON response`);
            }
            if (!data.success || !data.data || !data.data.results || data.data.results.length === 0) {
                throw new Error("Parsing failure: Search returned no results or invalid format");
            }
        }
    }
];

async function runSmokeTests() {
    console.log("==========================================");
    console.log("   LuvLyrics Provider Smoke Test");
    console.log("==========================================");
    console.log(`Fixture: "${FIXTURE.track}" by ${FIXTURE.artist}`);
    console.log("------------------------------------------\n");

    let allPassed = true;
    let results = [];

    for (const provider of providers) {
        process.stdout.write(`Testing ${provider.name}... `);
        try {
            await provider.test();
            console.log("✅ PASS");
            results.push({ name: provider.name, status: "PASS", error: null });
        } catch (error) {
            console.log("❌ FAIL");
            console.log(`   -> ${error.message}`);
            results.push({ name: provider.name, status: "FAIL", error: error.message });
            allPassed = false;
        }
    }

    console.log("\n==========================================");
    console.log("   Summary");
    console.log("==========================================");
    results.forEach(r => {
        console.log(`[${r.status}] ${r.name}`);
        if (r.error) {
            console.log(`      ${r.error}`);
        }
    });

    if (!allPassed) {
        console.log("\n❌ Smoke test failed. Some providers are down or have drifted.");
        process.exit(1);
    } else {
        console.log("\n✅ All core providers are healthy.");
        process.exit(0);
    }
}

runSmokeTests();
