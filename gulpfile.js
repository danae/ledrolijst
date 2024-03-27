const brfs = require('brfs');
const browserify = require('browserify');
const buffer = require('vinyl-buffer');
const gulp = require('gulp');
const rename = require('gulp-rename');
const sass = require('gulp-sass')(require('sass'));
const source = require('vinyl-source-stream');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
var webserver = require('gulp-webserver');


function handleError(err) {
  console.error(err);
  this.emit('end');
}


async function js() {
  const b = browserify('./src/js/main.js', {debug: true});
  b.transform('brfs');

  return b.bundle()
    .on('error', handleError)
    .pipe(source('bundle.js'))
    .pipe(buffer())
    .pipe(gulp.dest('./dist/js'))
    .pipe(sourcemaps.init({loadMaps: true}))
    //.pipe(uglify())
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('./dist/js'));
}

async function css() {
  return gulp.src('./src/scss/main.scss')
    .pipe(rename('bundle.css'))
    .pipe(sourcemaps.init())
    .pipe(sass({includePaths: ['./node_modules']})
       .on('error', handleError))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('./dist/css'));
}

async function dev() {
  gulp.watch('src/js/**.js', js);
  gulp.watch('src/data/**', js);
  gulp.watch('src/templates/**', js);
  gulp.watch('src/scss/**.scss', css);

  return gulp.src('.')
    .pipe(webserver({fallback: 'index.html', livereload: true}))
    .on('error', handleError);
}


exports.build = gulp.series(js, css);
exports.dev = dev;
