const config = {
	langs: ['zh', 'en'],
	langsKeyToGenerate: ['zh'],
	compileLang: process.env.COMPILE_LANG || 'zh',
	i18nPath: './i18n/',
	i18nAttrs: ['title', 'class'],
	isProduction: process.env.NODE_ENV === 'production'
};

const { src, dest, series, parallel } = require('gulp');
const gulpFontSpider = require('gulp-font-spider');
const gulpCSSMinify = require('gulp-clean-css');
const gulpHTMLMinify = require('gulp-htmlmin');
const clean = require('gulp-clean');
const cheerio = require('cheerio');
const through = require('through2');
const YAML = require('yaml');
const fs = require('fs');

const cleanUpPreviousBuild = () => src('./dist', { read: false, allowEmpty: true }).pipe(clean());
const cleanUpOriginalFonts = () => src('./dist/**/.font-spider', { read: false }).pipe(clean());
const copyPublicFiles = () => src('./public/**').pipe(dest('./dist/'));
const copyAssets = () => src('./assets/**').pipe(dest('./dist/assets/'));
const copyFonts = () => src('./fonts/**').pipe(dest('./dist/fonts/'));

const fontSpider = () => src('./dist/*.html')
	.pipe(gulpFontSpider({ silent: false }))
	.pipe(dest('./dist/'))
;
const cssMinify = () => src('./dist/assets/*.css').pipe(gulpCSSMinify({ compatibility: 'ie8' })).pipe(dest('./dist/assets/'));
const htmlMinify = () => src('./dist/*.html').pipe(gulpHTMLMinify({ collapseWhitespace: true })).pipe(dest('./dist/'));

const getLangFileName = (orig, lang) => {
	const idxDot = orig.lastIndexOf('.');
	const filename = idxDot < 1 ? orig : orig.substring(0, idxDot);
	return `${filename}.${lang}.yaml`;
};
const htmlCompile = () => src('./*.html')
	.pipe(through.obj(function (file, _, callback) {
		if (file.isBuffer()) {
			let lang = {};
			try {
				lang = YAML.parse(fs.readFileSync(config.i18nPath + getLangFileName(file.basename, config.compileLang), 'utf-8'));
			} catch (_) {}
			const $ = cheerio.load(file.contents.toString(), { decodeEntities: false });
			const i18nElements = $(['[i18n]', '[i18n-if]', '[i18n-key]', ...config.i18nAttrs.map(s => `[i18n-${s}]`)].join(',')).map((_, e) => e).get();
			for(let i in i18nElements) {
				const e = i18nElements[i];
				let val;
				if (typeof $(e).attr('i18n') === 'string') {
					val = lang[$(e).html()];
					if (val) {
						$(e).html(val);
					}
				} else if ($(e).attr('i18n-key')) {
					val = lang[$(e).attr('i18n-key')];
					if (val) {
						$(e).html(val);
					}
				}
				$(e).removeAttr('i18n').removeAttr('i18n-key');

				config.i18nAttrs.forEach(attr => {
					const val = $(e).attr(`i18n-${attr}`);
					if (val) {
						$(e).attr(attr, lang[val] || val);
					}
					$(e).removeAttr(`i18n-${attr}`);
				});

				if (typeof $(e).attr('i18n-if') === 'string') {
					if ($(e).attr('i18n-if') === config.compileLang) {
						$(e).removeAttr('i18n-if');
					} else {
						$(e).remove();
					}
				}
			}

			const gaTrackId = (process.env.GOOGLE_ANALYTICS_ID || '').trim();
			if (gaTrackId) {
				const script = `<script>(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)})(window,document,'script','https://www.google-analytics.com/analytics.js','ga');ga('create','${gaTrackId}','auto');ga('send','pageview');</script>`;
				$(script).appendTo($('body'));
			}

			file.contents = Buffer.from($.html());
			this.push(file);
		}
		return callback();
	}))
	.pipe(dest('./dist/'))
;
const i18nExtractKeys = () => src('./*.html')
	.pipe(through.obj(function (file, _, callback) {
		if (file.isBuffer()) {
			const $ = cheerio.load(file.contents.toString(), { decodeEntities: false });
			const i18nElements = $(['[i18n]', '[i18n-key]', ...config.i18nAttrs.map(s => `[i18n-${s}]`)].join(',')).map((_, e) => e).get();
			const keys = {};
			for(let i in i18nElements) {
				const e = i18nElements[i];
				if (typeof $(e).attr('i18n') === 'string') {
					keys[$(e).html()] = '';
				} else if ($(e).attr('i18n-key')) {
					keys[$(e).attr('i18n-key')] = '';
				}
				config.i18nAttrs.forEach(attr => {
					if ($(e).attr(`i18n-${attr}`)) {
						keys[$(e).attr(`i18n-${attr}`)] = '';
					}
				});
			}
			config.langsKeyToGenerate.forEach(lang => {
				const f = file.clone();
				f.basename = getLangFileName(file.basename, lang);
				const newKeys = { ...keys };
				try {
					const old = YAML.parse(fs.readFileSync(config.i18nPath + f.basename, 'utf-8'));
					Object.entries(old).forEach(([k, v]) => newKeys[k] = v);
				} catch (_) {}
				f.contents = Buffer.from(YAML.stringify(newKeys));
				this.push(f);
			});
		}
		return callback();
	}))
	.pipe(dest('./i18n/'))
;

const DefaultTasks = [
	parallel(
		copyAssets,
		copyFonts,
		copyPublicFiles,
		htmlCompile
	),
	fontSpider,
	cleanUpOriginalFonts
];
if (config.isProduction) {
	DefaultTasks.push(parallel(
		cssMinify,
		htmlMinify
	));
}

exports.default = series(...DefaultTasks);
exports.clean = cleanUpPreviousBuild;
exports['i18n:extract'] = i18nExtractKeys;