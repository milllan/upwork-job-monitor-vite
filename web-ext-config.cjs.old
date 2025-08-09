// This file configures the web-ext command-line tool.
const path = require('path');

module.exports = {
    // Global options
    sourceDir: path.resolve(__dirname, 'dist/firefox'),
    verbose: false,

    // Command-specific options for "run"
    run: {
        // --- THIS IS THE FIX ---
        // Point to the official Firefox Developer Edition executable.
        // The default installation path on Windows is used here.
        // Adjust if you installed it elsewhere.
        firefox: 'C:\\Program Files\\Firefox Developer Edition\\firefox.exe',

        // The URL to open when the browser starts
        startUrl: ['https://www.upwork.com/nx/find-work/'],

        // Let web-ext create a clean, persistent profile for development.
        // This avoids issues with your main profile being locked.
        firefoxProfile: './.firefox_profile_dev',
        keepProfileChanges: true,
    },
};
