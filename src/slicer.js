/*
 * ShareVol
 * Lightweight WebGL volume viewer/slicer
 *
 * Copyright (c) 2014, Monash University. All rights reserved.
 * Author: Owen Kaluza - owen.kaluza ( at ) monash.edu
 *
 * Licensed under the GNU Lesser General Public License
 * https://www.gnu.org/licenses/lgpl.html
 *
 */

function Slicer(props, image, filter, parentEl) {
  this.image = image;
  this.res = props.volume.res;
  this.dims = [props.volume.res[0] * props.volume.scale[0], 
               props.volume.res[1] * props.volume.scale[1], 
               props.volume.res[2] * props.volume.scale[2]];
  this.slices = [0.5, 0.5, 0.5];

  // Set properties
  this.properties = {};
  this.properties.show = true;
  this.properties.X = Math.round(this.res[0] / 2);
  this.properties.Y = Math.round(this.res[1] / 2);
  this.properties.Z = Math.round(this.res[2] / 2);

  this.properties.minX = 0;
  this.properties.maxX = Math.round(this.res[0]);
  this.properties.minY = 0;
  this.properties.maxY = Math.round(this.res[1]);
  this.properties.minZ = 0;
  this.properties.maxZ = Math.round(this.res[2]);

  this.properties.brightness = 0.0;
  this.properties.contrast = 1.0;
  this.properties.power = 1.0;
  this.properties.usecolourmap = false;
  this.properties.layout = "YzX";
  this.flipY = false;
  this.properties.zoom = 1.0;

  //brush
  this.properties.brushSize = 1;
  this.properties.enableBrush = false;
  this.properties.brushColour =  [214, 188, 86];
  this.properties.brushName = 'new brush';
  this.properties.eraser = false;

  this.currentBrush = {

    color: [214, 188, 86],
    name: 'brush1',
    brushSize:5,
    lineCoords:[],
    axis: null

  }
  this.properties.brushCoords = [];
  

  this.container = document.createElement("div");
  this.container.style.cssText = "position: absolute; bottom: 10px; left: 10px; margin: 0px; padding: 0px; pointer-events: none;";
  if (!parentEl) parentEl = document.body;
  parentEl.appendChild(this.container);

  //Load from local storage or previously loaded file
  if (props.slices) this.load(props.slices);

  this.canvas = document.createElement("canvas");
  this.canvas.style.cssText = "position: absolute; bottom: 0px;   z-index: 0; margin: 0px; padding: 0px; border: none; background: rgba(0,0,0,0); pointer-events: none;";

  this.overlayCanvas = document.createElement("canvas");
  this.overlayCanvas.style.cssText = 'position: absolute; bottom: 0px;   z-index: 1; margin: 0px; padding: 0px; border: none; background: rgba(0,0,0,0); pointer-events: none;';
  this.overlayCanvasContext =  this.overlayCanvas.getContext('2d');

  this.container.appendChild(this.overlayCanvas);

  this.doLayout();

  this.canvas.mouse = new Mouse(this.canvas, this);

  this.webgl = new WebGL(this.canvas);
  this.gl = this.webgl.gl;

  this.filter = this.gl.NEAREST; //Nearest-neighbour (default)
  if (filter == "linear") this.filter = this.gl.LINEAR;

  //Use the default buffers
  this.webgl.init2dBuffers(this.gl.TEXTURE2);

  //Compile the shaders
  this.program = new WebGLProgram(this.gl, 'texture-vs', 'texture-fs');
  if (this.program.errors) OK.debug(this.program.errors);
  this.program.setup(["aVertexPosition"], ["palette", "texture", "colourmap", "cont", "bright", "power", "slice", "dim", "res", "axis", "select"]);


  this.gl.clearColor(0, 0, 0, 0);
  this.gl.enable(this.gl.BLEND);
  this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  this.gl.enable(this.gl.SCISSOR_TEST);

  //Load the textures
  this.loadImage(this.image);

  //Hidden?
  if (!this.properties.show) this.toggle();
}

Slicer.prototype.toggle = function() {
  if (this.container.style.visibility == 'hidden')
    this.container.style.visibility = 'visible';
  else
    this.container.style.visibility = 'hidden';
}

Slicer.prototype.addGUI = function(gui) {
  this.gui = gui;
  var that = this;
  //Add folder
  var f1 = this.gui.addFolder('Слои');
  f1.add(this.properties, 'show').onFinishChange(function(l) {that.toggle();});
  //["hide/show"] = function() {};
  f1.add(this.properties, 'zoom', 0.01, 4.0, 0.1).listen().onFinishChange(function(l) {that.doLayout(); that.draw();});
  f1.add(this.properties, 'brightness', -1.0, 1.0, 0.01).listen();
  f1.add(this.properties, 'contrast', 0.0, 3.0, 0.01).listen();
  f1.add(this.properties, 'power', 0.01, 5.0, 0.01).listen();
  f1.add(this.properties, 'usecolourmap');
  f1.add(this.properties, 'layout').onFinishChange(function(l) {that.doLayout(); that.draw();});

  f1.add(this.properties, 'X', 0, this.res[0], 1).listen();
  f1.add(this.properties, 'Y', 0, this.res[1], 1).listen();
  f1.add(this.properties, 'Z', 0, this.res[2], 1).listen();
  
  var f2 = this.gui.addFolder('Область интереса (слои)');
  f2.add(this.properties, 'minX', 0, this.res[0], 1).listen().onFinishChange(function(l) {if (volume) volume.clipminX(l);});
  f2.add(this.properties, 'maxX', 0, this.res[0], 1).listen().onFinishChange(function(l) {if (volume) volume.clipmaxX(l);});
  f2.add(this.properties, 'minY', 0, this.res[1], 1).listen().onFinishChange(function(l) {if (volume) volume.clipminY(l);});
  f2.add(this.properties, 'maxY', 0, this.res[1], 1).listen().onFinishChange(function(l) {if (volume) volume.clipmaxY(l);});
  f2.add(this.properties, 'minZ', 0, this.res[2], 1).listen().onFinishChange(function(l) {if (volume) volume.clipminZ(l);});
  f2.add(this.properties, 'maxZ', 0, this.res[2], 1).listen().onFinishChange(function(l) {if (volume) volume.clipmaxZ(l);});
  state.properties.server = ''
  // if (state.properties.server)
    f2.add({"Обновить" : function() {ajaxPost(state.properties.server + "/update", "data=" + encodeURIComponent(getData(true, true)));}}, 'Обновить');
  
  //f2.open();

  var changefn = function(value) {that.draw();};
  for (var i in f1.__controllers)
    f1.__controllers[i].onChange(changefn);
  for (var i in f2.__controllers)
    f2.__controllers[i].onChange(changefn);

  //--------------Brush
  // this.properties.brushSize = 1;
  // this.properties.enableBrush = false;
  // this.properties.brushColour =  [214, 188, 86];

  var f3 = this.gui.addFolder('Кисточка');
  //this.properties.brushName

  f3.add(this.properties, 'brushName').onChange( function(){

    //that.currentIntersectBox.name = newName.name;

  });

  f3.add( {"new brush": function(){

    that.currentBrush = {
      
          color: [214, 188, 86],
          name: 'brush1',
          brushSize:1,
          lineCoords:[],
          axis: null
      
      }
    
    that.overlayCanvasContext.clearRect(0, 0, that.overlayCanvas.width, that.overlayCanvas.height);

    //that.draw();

  }}, 'new brush');

  f3.add( {"save brush": function(){
    
        //todo
    
      }}, 'save brush');
  f3.add(this.properties, 'enableBrush');
  f3.add(this.properties, 'eraser');
  f3.add(this.properties, 'brushSize', 1, 10, 1).onChange(function(){

    that.currentBrush.brushSize = that.properties.brushSize;
    that.draw();
    
  });
  f3.addColor(this.properties, 'brushColour').onChange(function(){

    that.currentBrush.color = that.properties.brushColour;
    that.draw();

  });



  // f3.add( currentItem, 'selecTedBox', Object.keys(this.interSectionBoxes) ).onChange(function() {
    
  //       //todo   

  // });




  f3.open();

}

Slicer.prototype.get = function() {
  var data = {};
  //data.colourmap = colours.palette.toString();
  data.properties = this.properties;
  return data;
}

Slicer.prototype.load = function(src) {
  //colours.read(data.colourmap);
  //colours.update();
  for (var key in src.properties)
    this.properties[key] = src.properties[key]
}

Slicer.prototype.setX = function(val) {this.properties.X = val * this.res[0]; this.draw();}
Slicer.prototype.setY = function(val) {this.properties.Y = val * this.res[1]; this.draw();}
Slicer.prototype.setZ = function(val) {this.properties.Z = val * this.res[2]; this.draw();}

Slicer.prototype.clipminX = function(val) {this.properties.minX = val * this.res[0]; this.draw();}
Slicer.prototype.clipmaxX = function(val) {this.properties.maxX = val * this.res[0]; this.draw();}
Slicer.prototype.clipminY = function(val) {this.properties.minY = val * this.res[1]; this.draw();}
Slicer.prototype.clipmaxY = function(val) {this.properties.maxY = val * this.res[1]; this.draw();}
Slicer.prototype.clipminZ = function(val) {this.properties.minZ = val * this.res[2]; this.draw();}
Slicer.prototype.clipmaxZ = function(val) {this.properties.maxZ = val * this.res[2]; this.draw();}

Slicer.prototype.doLayout = function() {
  this.viewers = [];

  var x = 0;
  var y = 0;
  var xmax = 0;
  var ymax = 0;
  var rotate = 0;
  var alignTop = true;

  removeChildren(this.container);

  var that = this;
  var buffer = "";
  var rowHeight = 0, rowWidth = 0;
  var addViewer = function(idx) {
    var mag = 1.0;
    if (buffer) mag = parseFloat(buffer);
    var v = new SliceView(that, x, y, idx, rotate, mag);
    that.viewers.push(v);
    that.container.appendChild(v.div);

    y += v.viewport.height + 5; //Offset by previous height
    var w = v.viewport.width + 5;
    if (w > rowWidth) rowWidth = w;
    if (y > ymax) ymax = y;
  }
  

  //Process based on layout
  this.flipY = false;
  for (var i=0; i<this.properties.layout.length; i++) {
    var c = this.properties.layout.charAt(i);
    rotate = 0;
    switch (c) {
      case 'X':
        rotate = -90;
      case 'x':
        addViewer(0);
        break;
      case 'Y':
        rotate = 180;
      case 'y':
        addViewer(1);
        break;
      case 'Z':
        rotate = 360;
      case 'z':
        addViewer(2);
        break;
      case '|':
        y = 0;
        x += rowWidth;
        rowWidth = 0;
        break;
      case '_':
        this.flipY = true;
        break;
      case '-':
        alignTop = false;
        break;
      default:
        //Add other chars to buffer, if a number will be used as zoom
        buffer += c;
        continue;
    }
    //Clear buffer
    buffer = "";
  }

  this.width = x + rowWidth;
  this.height = ymax;

  console.log(this.width, this.height);

  //Restore the main canvas
  this.container.appendChild(this.canvas);
  this.container.appendChild(this.overlayCanvas);

  if (alignTop) {
    this.container.style.bottom = "";
    this.container.style.top = (this.height + 10) + "px";
  } else {
    this.container.style.top = undefined;
    this.container.style.bottom = 10 + "px";
  }
}

Slicer.prototype.loadImage = function(image) {
  //Texture load
  for (var i=0; i<3; i++)
    this.webgl.loadTexture(image, this.filter);
  this.reset();
}

Slicer.prototype.reset = function() {
  this.dimx = this.image.width / this.res[0];
  this.dimy = this.image.height / this.res[1];
  //console.log(this.res[0] + "," + this.res[1] + "," + this.res[2] + " -- " + this.dimx + "x" + this.dimy);
}

Slicer.prototype.updateColourmap = function() {
  this.webgl.updateTexture(this.webgl.gradientTexture, $('gradient'), this.gl.TEXTURE2);  //Use 2nd texture unit
  this.draw();
}

Slicer.prototype.draw = function() {
  this.slices = [(this.properties.X-1)/(this.res[0]-1), 
                 (this.properties.Y-1)/(this.res[1]-1),
                 (this.properties.Z-1)/(this.res[2]-1)];

  if (this.width != this.canvas.width || this.height != this.canvas.height) {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.setAttribute("width", this.width);
    this.canvas.setAttribute("height", this.height);

    this.overlayCanvas.width = this.width;
    this.overlayCanvas.height = this.height;
    this.overlayCanvas.setAttribute("width", this.width);
    this.overlayCanvas.setAttribute("height", this.height);

    if (this.webgl) {
      this.gl.viewportWidth = this.width;
      this.gl.viewportHeight = this.height;
      this.webgl.viewport = new Viewport(0, 0, this.width, this.height);
    }
  }

  this.webgl.use(this.program);

  //Uniform variables

  //Gradient texture
  this.gl.activeTexture(this.gl.TEXTURE0);
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.webgl.gradientTexture);
  this.gl.uniform1i(this.program.uniforms["palette"], 0);

  //Options
  this.gl.uniform1i(this.program.uniforms["colourmap"], this.properties.usecolourmap);

  // brightness and contrast
  this.gl.uniform1f(this.program.uniforms["bright"], this.properties.brightness);
  this.gl.uniform1f(this.program.uniforms["cont"], this.properties.contrast);
  this.gl.uniform1f(this.program.uniforms["power"], this.properties.power);

  //Image texture
  this.gl.activeTexture(this.gl.TEXTURE1);
  this.gl.bindTexture(this.gl.TEXTURE_2D, this.webgl.textures[0]);
  this.gl.uniform1i(this.program.uniforms["texture"], 1);

  //Clear all
  this.gl.scissor(0, 0, this.width, this.height);
  this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

  //Draw each slice viewport
  for (var i=0; i<this.viewers.length; i++)
    this.drawSlice(i);

    this.drawIntersections();

    this.drawBrush();
    
}

Slicer.prototype.drawSlice = function(idx) {
  var view = this.viewers[idx];
  var vp = view.viewport;

  //Set selection crosshairs
  var sel;
  if (view.rotate == -90)
    sel = [this.slices[view.j], 1.0 - this.slices[view.i]];
  else if (view.rotate == 180) 
    sel = [1 - this.slices[view.i], 1 - this.slices[view.j]];
  else if (view.rotate == 360) 
    sel = [1 - this.slices[view.i], this.slices[view.j]];
  else
    sel = [this.slices[view.i], this.slices[view.j]];
  
  //Swap y-coord
  if (!this.flipY) sel[1] = 1.0 - sel[1];

  this.webgl.viewport = vp;
  this.gl.scissor(vp.x, vp.y, vp.width, vp.height);
  //console.log(JSON.stringify(vp));

  //Apply translation to origin, any rotation and scaling (inverse of zoom factor)
  this.webgl.modelView.identity()
  this.webgl.modelView.translate([0.5, 0.5, 0])
  this.webgl.modelView.rotate(-view.rotate, [0, 0, 1]);

  //Apply zoom and flip Y
  var scale = [1.0/2.0, -1.0/2.0, -1.0];
  if (this.flipY) scale[1] = -scale[1];
  this.webgl.modelView.scale(scale);

  //Texturing
  //this.gl.uniform1i(this.program.uniforms["slice"], ));
  this.gl.uniform3f(this.program.uniforms['slice'], this.slices[0], this.slices[1], this.slices[2]);
  this.gl.uniform2f(this.program.uniforms["dim"], this.dimx, this.dimy);
  this.gl.uniform3i(this.program.uniforms["res"], this.res[0], this.res[1], this.res[2]);
  this.gl.uniform1i(this.program.uniforms["axis"], view.axis);
  //Convert [0,1] selection coords to pixel coords
  this.gl.uniform2i(this.program.uniforms["select"], vp.width * sel[0] + vp.x, vp.height * sel[1] + vp.y);

  this.webgl.initDraw2d();

  this.gl.enable(this.gl.BLEND);

  //Draw, single pass
  this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
  this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, this.webgl.vertexPositionBuffer.numItems);
}

Slicer.prototype.drawBrush = function() {

  // need convert draw coord to new size and etc

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }


  var color = /*this.properties.brushColour instanceof Array?*/  rgbToHex( 
    Math.floor(this.currentBrush.color[0]),
    Math.floor(this.currentBrush.color[1]),
    Math.floor(this.currentBrush.color[2]))/*: this.properties.brushColour*/;

  this.overlayCanvasContext.strokeStyle = color;
  this.overlayCanvasContext.fillStyle = color;
  

  for ( var i = 0; i < this.currentBrush.lineCoords.length; i+=2 ) {

    this.overlayCanvasContext.beginPath();
    this.overlayCanvasContext.arc(this.currentBrush.lineCoords[i], this.currentBrush.lineCoords[i+1], Math.floor ( this.currentBrush.brushSize ), 0, 2 * Math.PI);
    this.overlayCanvasContext.fill();

  }


}

Slicer.prototype.drawIntersections = function() {

  //console.log(volume);
  this.overlayCanvasContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);  

  var testData = {
      'testBox1': {
        minVertices : [0,0,0],
        maxVertices: [0.9,0.8,0.7],
        color: [218, 40, 40]
      },
      'testBox2': {
        minVertices : [0.5,0.5,0.5],
        maxVertices: [0.7,1,0.6],
        color: [24, 172, 44]
      }
  };

  testData = volume.interSectionBoxes;

  function drawRect ( x,y,width,height, testData, overlayCanvasContext ) {

    function rgbToHex(r, g, b) {
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
  
    var color =   rgbToHex( Math.floor(testData[boxkey].color[0]),
                            Math.floor(testData[boxkey].color[1]),
                            Math.floor(testData[boxkey].color[2]));
    
    overlayCanvasContext.beginPath();                        
    overlayCanvasContext.strokeStyle = color;
    overlayCanvasContext.lineWidth=2;
    
    overlayCanvasContext.rect(x,y,width,height);
    overlayCanvasContext.stroke();

  }

  console.log(this.viewers);

  for( viewport of this.viewers ) {

    if( viewport.axis == 2 ) {

      for ( boxkey of Object.keys(testData) ) {

        var zMin = testData[boxkey].minVertices[2];
        var zMax = testData[boxkey].maxVertices[2];

        if( zMin < this.properties.Z/this.dims[2] && zMax >  this.properties.Z/this.dims[2]) {

          var v = viewport.viewport;

          var x = testData[boxkey].minVertices[0] * v.width + v.x;
          var width = testData[boxkey].maxVertices[0] * v.width;

          var y = testData[boxkey].minVertices[1] * v.height + v.y;
          var height = testData[boxkey].maxVertices[1] * v.height;

          drawRect( x,y,width,height, testData, this.overlayCanvasContext);

        }

      }

    } else if( viewport.axis == 1 ) {

      for ( boxkey of Object.keys(testData) ) {
        
                var yMin = testData[boxkey].minVertices[1];
                var yMax = testData[boxkey].maxVertices[1];
        
        if( yMin < this.properties.Y/this.dims[1] && yMax >  this.properties.Y/this.dims[1]) {

          var v = viewport.viewport;

          var x = testData[boxkey].minVertices[0] * v.width + v.x;
          var width = testData[boxkey].maxVertices[0] * v.width;

          var y = testData[boxkey].minVertices[2] * v.height + v.y;
          var height = testData[boxkey].maxVertices[2] * v.height;

          drawRect( x,y,width,height, testData, this.overlayCanvasContext);

        }
        
      }

    }
    else if( viewport.axis == 0 ) {
    
          for ( boxkey of Object.keys(testData) ) {
            
                    var xMin = testData[boxkey].minVertices[0];
                    var xMax = testData[boxkey].maxVertices[0];
            
            if( xMin < this.properties.X/this.dims[0] && xMax >  this.properties.X/this.dims[0]) {
    
              var v = viewport.viewport;
    
              var x = testData[boxkey].minVertices[2] * v.width + v.x;
              var width = testData[boxkey].maxVertices[2] * v.width;
    
              var y = testData[boxkey].minVertices[1] * v.height + v.y;
              var height = testData[boxkey].maxVertices[1] * v.height;
    
              drawRect( x,y,width,height, testData, this.overlayCanvasContext);
    
            }
            
      }
    
    }

  }
  
  //console.log(this.viewers);
  //console.log(this.properties.X,this.properties.Y,this.properties.Z);


}



Slicer.prototype.erase = function( x,y ) {
  console.log('clear');
  var size =  Math.floor ( this.currentBrush.brushSize );
  this.overlayCanvasContext.clearRect(x, y, size, size);

}



function SliceView(slicer, x, y, axis, rotate, magnify) {
  this.axis = axis;
  this.slicer = slicer;

  this.magnify = magnify || 1.0;
  this.origin = [0.5,0.5];
  this.rotate = rotate || 0;

  //Calc viewport
  this.i = 0;
  this.j = 1;
  if (axis == 0) this.i = 2;
  if (axis == 1) this.j = 2;

  var w = Math.round(slicer.dims[this.i] * slicer.properties.zoom * this.magnify);
  var h = Math.round(slicer.dims[this.j] * slicer.properties.zoom * this.magnify);

  if (this.rotate == 90)
    this.viewport = new Viewport(x, y, h, w);
  else if (this.rotate == -90)
    this.viewport = new Viewport(x, y, h, w);
  else
    this.viewport = new Viewport(x, y, w, h);

  //Border and mouse interaction element
  this.div = document.createElement("div");
  this.div.style.cssText = "padding: 0px; margin: 0px; outline: 2px solid rgba(64,64,64,0.5); position: absolute; display: inline-block; pointer-events: auto;";
  this.div.id = "slice-div-" + axis;

  this.div.style.left = x + "px";
  this.div.style.bottom = y + "px";

  //console.log(w,h,x,y);

  this.div.style.width = this.viewport.width + "px";
  this.div.style.height = this.viewport.height + "px";

  this.div.mouse = new Mouse(this.div, this);
}

SliceView.prototype.click = function(event, mouse) {

  if(this.slicer.currentBrush.axis === null) {

    this.slicer.currentBrush.axis = this.axis;

  }
  //console.log(mouse.x,mouse.y);

  if( this.axis === this.slicer.currentBrush.axis
    &&( mouse.x  + this.viewport.x ) < ( this.viewport.x + this.viewport.width ) 
    && ( mouse.x  + this.viewport.x ) > this.viewport.x
    && ( mouse.y  + this.viewport.y ) < ( this.viewport.y + this.viewport.height )
    /*&& ( mouse.y  + this.viewport.y ) < this.viewport.y*/) {

      if( !this.slicer.properties.eraser ) {
        this.slicer.currentBrush.lineCoords.push(mouse.x  + this.viewport.x);
        this.slicer.currentBrush.lineCoords.push(mouse.y + this.viewport.y);
      } else {

        //TO DO
        //this.slicer.erase( mouse.x  + this.viewport.x, mouse.y + this.viewport.y);

      }

  }  
  //----------------------------------------------------------------------------

  if (this.slicer.flipY) mouse.y = mouse.element.clientHeight - mouse.y;

  var coord;

  //Rotated?
  if (this.rotate == 90)
    coord = [mouse.y / mouse.element.clientHeight, 1.0 - mouse.x / mouse.element.clientWidth];
  else if (this.rotate == -90)
    coord = [1 - mouse.y / mouse.element.clientHeight, mouse.x / mouse.element.clientWidth];
  else if (this.rotate == 180)
    coord = [1 - mouse.x / mouse.element.clientHeight,1 - mouse.y / mouse.element.clientWidth];
  else if (this.rotate == 360)
    coord = [1 - mouse.x / mouse.element.clientHeight, mouse.y / mouse.element.clientWidth];
  else 
    coord = [mouse.x / mouse.element.clientWidth, mouse.y / mouse.element.clientHeight];

  var A = Math.round(this.slicer.res[this.i] * coord[0]);
  var B = Math.round(this.slicer.res[this.j] * coord[1]);

  if (this.axis == 0) {
    slicer.properties.Z = A;
    slicer.properties.Y = B;
  } else if (this.axis == 1) {
    slicer.properties.X = A;
    slicer.properties.Z = B;
  } else {
    slicer.properties.X = A;
    slicer.properties.Y = B;
  }

  this.slicer.draw();
}

SliceView.prototype.wheel = function(event, mouse) {
  if (this.axis == 0) slicer.properties.X += event.spin;
  if (this.axis == 1) slicer.properties.Y += event.spin;
  if (this.axis == 2) slicer.properties.Z += event.spin;

  //console.log(slicer.properties.X,slicer.properties.Y,slicer.properties.Z);

  this.slicer.draw();
}

SliceView.prototype.move = function(event, mouse) {
  if (mouse.isdown) this.click(event, mouse);
}


