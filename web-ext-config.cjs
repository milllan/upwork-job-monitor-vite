// This file configures the web-ext command-line tool.
// For details, see https://extensionworkshop.com/documentation/develop/web-ext-command-reference/

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

module.exports = {
    // --- Global options ---
    // The sourceDir is a global option, not a run option.
    // This was the source of the error.
    sourceDir: path.resolve(__dirname, 'dist/firefox'),
    verbose: false,

    // --- Command-specific options ---
    run: {
        // The browser to run
        target: ['firefox-desktop'],

        // The executable path for Zen Browser
        firefox: 'C:/Program Files/Zen Browser/zen.exe',

        // The URL to open when the browser starts
        startUrl: ['https://www.upwork.com/nx/find-work/'],

        // --- Profile Persistence ---
        // Keep profile changes to stay logged in
        keepProfileChanges: true,
        // Give the profile a permanent home in your project folder
        firefoxProfile:
            'C:\\Users\\milll\\AppData\\Roaming\\zen\\Profiles\\wkigpm3r.Default (alpha)',
    },
};
