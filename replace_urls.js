const fs = require('fs');
const path = require('path');

const targetUrl = 'http://localhost:5000';
const replacementUrl = 'https://backend1-vsis.onrender.com';
const directory = 'e:\\smartparkingcopy\\ParkingApp';

function replaceInFile(filePath) {
    if (filePath.includes('node_modules') || filePath.includes('.git') || filePath.includes('dist')) return;
    
    const ext = path.extname(filePath);
    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
        let content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(targetUrl)) {
            content = content.split(targetUrl).join(replacementUrl);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated: ${filePath}`);
        }
    }
}

function traverseDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            traverseDir(fullPath);
        } else {
            replaceInFile(fullPath);
        }
    }
}

traverseDir(directory);
console.log("Replacement complete.");
