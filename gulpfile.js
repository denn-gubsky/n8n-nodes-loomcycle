const { src, dest } = require('gulp');

/**
 * Copy node + credential icons (.svg / .png) from source tree to dist/.
 * tsc only emits .ts → .js/.d.ts; icons must be moved separately so they
 * land under dist/nodes/<Name>/<Name>.svg where n8n's loader reads them.
 */
function buildIcons() {
	return src('{credentials,nodes}/**/*.{png,svg}').pipe(dest('dist'));
}

exports['build:icons'] = buildIcons;
exports.default = buildIcons;
