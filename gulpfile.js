var gulp = require('gulp');
var concat = require('gulp-concat');
var server = require( 'gulp-develop-server' );

gulp.task('default', [  'concat','server:start','server:restart' ] , function() {
   
});

gulp.task( 'concat', function() {
    console.log("Concating and moving all the js files in sharevol.js");
    gulp.src(["lib/**.js", "src/**.js"])
        .pipe(concat('sharevol.js'))
        .pipe(gulp.dest('./'));
});

// run server 
gulp.task( 'server:start', function() {
    server.listen( { path: './server.js' } );
});
 
// restart server if app.js changed 
gulp.task( 'server:restart', function() {
    gulp.watch( [ 'src/**.js' ], [ 'concat', server.restart] );
});