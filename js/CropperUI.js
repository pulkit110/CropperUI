/*
Copyright 2008-2009 University of Toronto
Copyright 2008-2009 University of California, Berkeley
Copyright 2010-2011 OCAD University

Licensed under the Educational Community License (ECL), Version 2.0 or the New
BSD license. You may not use this file except in compliance with one these
Licenses.

You may obtain a copy of the ECL 2.0 License and BSD License at
https://github.com/fluid-project/infusion/raw/master/Infusion-LICENSE.txt
*/

// Declare dependencies
/*global window, fluid_1_4:true, jQuery*/

// JSLint options 
/*jslint white: true, funcinvoke: true, undef: true, newcap: true, nomen: true, regexp: true, bitwise: true, browser: true, forin: true, maxerr: 100, indent: 4 */

var fluid_1_4 = fluid_1_4 || {};

/****************
 * Image Editor *
 ****************/

(function ($, fluid) {

    //we'll add some private methods here

	var enableElement = function (that, elm) {
        elm.prop("disabled", false);
        elm.removeClass(that.options.styles.dim);
    };
    
    var disableElement = function (that, elm) {
        elm.prop("disabled", true);
        elm.addClass(that.options.styles.dim);
    };
    
    var showElement = function (that, elm) {
        elm.removeClass(that.options.styles.hidden);
    };
     
    var hideElement = function (that, elm) {
        elm.addClass(that.options.styles.hidden);
    };
    
    var bindDOMEvents = function (that) {
        that.locate("resizeButton").click(function () {
        	//TODO: Bind resize event
            //that.start();
        });
    };

    // holds all our boxes
	var boxes2 = [];
	
	// New, holds the 8 tiny boxes that will be our selection handles
	// the selection handles will be in this order:
	// 0  1  2
	// 3     4
	// 5  6  7
	var selectionHandles = [];
	
	// Hold canvas information
	var canvas;
	var ctx;
	var WIDTH;
	var HEIGHT;
	var resizeFactor;
	var image;
	var INTERVAL = 20;  // how often, in milliseconds, we check to see if a redraw is needed
	var imageX;
	var imageY;
	
	var isDrag = false;
	var isResizeDrag = false;
	var expectResize = -1; // New, will save the # of the selection handle if the mouse is over one.
	var mx, my; // mouse coordinates
	
	// when set to true, the canvas will redraw everything
	// invalidate() just sets this to false right now
	// we want to call invalidate() whenever we make a change
	var canvasValid = false;
	
	// The node (if any) being selected.
	var mySel = null;
	
	// The selection color and width. Right now we have a red selection with a small width
	var mySelColor = '#CC0000';
	var mySelWidth = 0;
	var mySelBoxColor = 'darkred'; // New for selection boxes
	var mySelBoxSize = 6;
	
	var blurStyle = 'rgba(0,0,0,0.4)';
	
	// we use a fake canvas to draw individual shapes for selection testing
	var ghostcanvas;
	var gctx; // fake canvas context
	
	// since we can drag from anywhere in a node
	// instead of just its x/y corner, we need to save
	// the offset of the mouse when we start dragging.
	var offsetx, offsety;
	
	// Padding and border style widths for mouse offsets
	var stylePaddingLeft, stylePaddingTop, styleBorderLeft, styleBorderTop;
	
	// Box object to hold data
	function Box2() {
		this.x = 0;
		this.y = 0;
		this.w = 1; // default width and height?
		this.h = 1;
		this.fill = '#444444';
	}
	
	// New methods on the Box class
	Box2.prototype = {
		// we used to have a solo draw function
		// each box is responsible for its own drawing
		// mainDraw() will call this with the normal canvas
		// cropperMouseDown will call this with the ghost canvas with 'black'
		draw: function(context, optionalColor) {
			if (context === gctx) {
				context.fillStyle = 'black'; // always want black for the ghost canvas
			} else {
				context.fillStyle = this.fill;
			}
	
			// We can skip the drawing of elements that have moved off the screen:
			if (this.x > WIDTH || this.y > HEIGHT)
				return;
			if (this.x + this.w < 0 || this.y + this.h < 0)
				return;
	
			//correct h and w if they get negative
			if (this.h < 0) {
				tempY = this.y + this.h;
				tempH = -this.h;
			} else {
				tempY = this.y;
				tempH = this.h;
			}
	
			if (this.w < 0) {
				tempX = this.x + this.w;
				tempW = -this.w;
			} else {
				tempX = this.x;
				tempW = this.w;
			}
	
			//Draw the rectangle for cropping
			context.fillRect(this.x,this.y,this.w,this.h);
	
			//draw blurred area around the rectangle
			context.fillStyle = blurStyle;
			context.fillRect(0,0,WIDTH,tempY);
			context.fillRect(0, tempY, tempX, HEIGHT-tempY);
			context.fillRect(tempX + tempW, tempY, WIDTH - (tempX + tempW), HEIGHT - tempY);
			context.fillRect(tempX, tempY + tempH, tempW, HEIGHT-tempY);
	
			// draw selection
			// this is a stroke along the box and also 8 new selection handles
			if (mySel === this) {
				context.strokeStyle = mySelColor;
				context.lineWidth = mySelWidth;
				context.strokeRect(this.x,this.y,this.w,this.h);
	
				// draw the boxes
	
				var half = mySelBoxSize / 2;
	
				// 0  1  2
				// 3     4
				// 5  6  7
	
				// top left, middle, right
				selectionHandles[0].x = this.x-half;
				selectionHandles[0].y = this.y-half;
	
				selectionHandles[1].x = this.x+this.w/2-half;
				selectionHandles[1].y = this.y-half;
	
				selectionHandles[2].x = this.x+this.w-half;
				selectionHandles[2].y = this.y-half;
	
				//middle left
				selectionHandles[3].x = this.x-half;
				selectionHandles[3].y = this.y+this.h/2-half;
	
				//middle right
				selectionHandles[4].x = this.x+this.w-half;
				selectionHandles[4].y = this.y+this.h/2-half;
	
				//bottom left, middle, right
				selectionHandles[6].x = this.x+this.w/2-half;
				selectionHandles[6].y = this.y+this.h-half;
	
				selectionHandles[5].x = this.x-half;
				selectionHandles[5].y = this.y+this.h-half;
	
				selectionHandles[7].x = this.x+this.w-half;
				selectionHandles[7].y = this.y+this.h-half;
	
				context.fillStyle = mySelBoxColor;
				for (var i = 0; i < 8; i ++) {
					var cur = selectionHandles[i];
					context.fillRect(cur.x, cur.y, mySelBoxSize, mySelBoxSize);
				}
			}
		} // end draw
	}
	
	//Initialize a new Box, add it, and invalidate the canvas
	function addRect(x, y, w, h, fill) {
		var rect = new Box2;
		rect.x = x;
		rect.y = y;
		rect.w = w
		rect.h = h;
		rect.fill = fill;
		boxes2.push(rect);
		invalidate();
	}
    
    //wipes the canvas context
	function clear(c) {
		c.clearRect(0, 0, WIDTH, HEIGHT);
	}
	
	// Main draw loop.
	// While draw is called as often as the INTERVAL variable demands,
	// It only ever does something if the canvas gets invalidated by our code
	function mainDraw() {
		if (canvasValid == false) {
			clear(ctx);
	
			// Add stuff you want drawn in the background all the time here
			drawImage(ctx, image, resizeFactor, imageX, imageY);
	
			// draw all boxes
			var l = boxes2.length;
			for (var i = 0; i < l; i++) {
				boxes2[i].draw(ctx); // we used to call drawshape, but now each box draws itself
			}
	
			canvasValid = true;
		}
	}
	
	// Happens when the mouse is moving inside the canvas
	function cropperMouseMove(e) {
		if (isDrag) {
			getMouse(e);
	
			mySel.x = mx - offsetx;
			mySel.y = my - offsety;
	
			// something is changing position so we better invalidate the canvas!
			invalidate();
		} else if (isResizeDrag) {
			// time ro resize!
			var oldx = mySel.x;
			var oldy = mySel.y;
	
			// 0  1  2
			// 3     4
			// 5  6  7
			switch (expectResize) {
				case 0:
					mySel.x = mx;
					mySel.y = my;
					mySel.w += oldx - mx;
					mySel.h += oldy - my;
					break;
				case 1:
					mySel.y = my;
					mySel.h += oldy - my;
					break;
				case 2:
					mySel.y = my;
					mySel.w = mx - oldx;
					mySel.h += oldy - my;
					break;
				case 3:
					mySel.x = mx;
					mySel.w += oldx - mx;
					break;
				case 4:
					mySel.w = mx - oldx;
					break;
				case 5:
					mySel.x = mx;
					mySel.w += oldx - mx;
					mySel.h = my - oldy;
					break;
				case 6:
					mySel.h = my - oldy;
					break;
				case 7:
					mySel.w = mx - oldx;
					mySel.h = my - oldy;
					break;
			}
	
			invalidate();
		}
	
		getMouse(e);
		
		// if the mouse is in box, then change the cursor
		var l = boxes2.length;
		var i = 0;
		for (i = 0; i < l; i++) {
			if (mx >= boxes2[i].x && mx <= boxes2[i].x + boxes2[i].w && my >= boxes2[i].y && my <= boxes2[i].y + boxes2[i].h) {
				this.style.cursor='move';
				break;
			}
		}
		if (i == l) {
			this.style.cursor='auto';
		}
		
		// if there's a selection see if we grabbed one of the selection handles
		if (mySel !== null && !isResizeDrag) {
			for (var i = 0; i < 8; i++) {
				// 0  1  2
				// 3     4
				// 5  6  7
	
				var cur = selectionHandles[i];
	
				// we dont need to use the ghost context because
				// selection handles will always be rectangles
				if (mx >= cur.x && mx <= cur.x + mySelBoxSize &&
				my >= cur.y && my <= cur.y + mySelBoxSize) {
					// we found one!
					expectResize = i;
					invalidate();
	
					switch (i) {
						case 0:
							this.style.cursor='nw-resize';
							break;
						case 1:
							this.style.cursor='n-resize';
							break;
						case 2:
							this.style.cursor='ne-resize';
							break;
						case 3:
							this.style.cursor='w-resize';
							break;
						case 4:
							this.style.cursor='e-resize';
							break;
						case 5:
							this.style.cursor='sw-resize';
							break;
						case 6:
							this.style.cursor='s-resize';
							break;
						case 7:
							this.style.cursor='se-resize';
							break;
					}
					return;
				}
	
			}
			// not over a selection box, return to normal
			isResizeDrag = false;
			expectResize = -1;
		}
	
	}
	
	// Happens when the mouse is clicked in the canvas
	function cropperMouseDown(e) {
		getMouse(e);
	
		//we are over a selection box
		if (expectResize !== -1) {
			isResizeDrag = true;
			return;
		}
	
		clear(gctx);
		var l = boxes2.length;
		for (var i = l-1; i >= 0; i--) {
			// draw shape onto ghost context
			boxes2[i].draw(gctx, 'black');
	
			// get image data at the mouse x,y pixel
			var imageData = gctx.getImageData(mx, my, 1, 1);
			var index = (mx + my * imageData.width) * 4;
	
			// if the mouse pixel exists, select and break
			if (imageData.data[3] > 0) {
				mySel = boxes2[i];
				offsetx = mx - mySel.x;
				offsety = my - mySel.y;
				mySel.x = mx - offsetx;
				mySel.y = my - offsety;
				isDrag = true;
	
				invalidate();
				clear(gctx);
				return;
			}
	
		}
		// havent returned means we have selected nothing
		mySel = null;
		// clear the ghost canvas for next time
		clear(gctx);
		// invalidate because we might need the selection border to disappear
		invalidate();
	}
	
	function cropperMouseUp() {
		isDrag = false;
		isResizeDrag = false;
		expectResize = -1;
	
		if (mySel) {
			if (mySel.h < 0) {
				mySel.y += mySel.h;
				mySel.h *= -1;
			}
	
			if (mySel.w < 0) {
				mySel.x += mySel.w;
				mySel.w *= -1;
			}
		}
	}
	
	// adds a new node
	function myDblClick(e) {
		getMouse(e);
		// for this method width and height determine the starting X and Y, too.
		// so I left them as vars in case someone wanted to make them args for something and copy this code
		var width = 20;
		var height = 20;
		//addRect(mx - (width / 2), my - (height / 2), width, height, 'rgba(220,205,65,0.7)');
	}
	
	function invalidate() {
		canvasValid = false;
	}
	
	// Sets mx,my to the mouse position relative to the canvas
	// unfortunately this can be tricky, we have to worry about padding and borders
	function getMouse(e) {
		var element = canvas, offsetX = 0, offsetY = 0;
	
		if (element.offsetParent) {
			do {
				offsetX += element.offsetLeft;
				offsetY += element.offsetTop;
			} while ((element = element.offsetParent));
		}
	
		// Add padding and border style widths to offset
		offsetX += stylePaddingLeft;
		offsetY += stylePaddingTop;
	
		offsetX += styleBorderLeft;
		offsetY += styleBorderTop;
	
		mx = e.pageX - offsetX;
		my = e.pageY - offsetY
	}
	
	function drawImage(imageCanvasContext, image, resizeFactor) {
		imageCanvasContext.drawImage(image, imageX, imageY, image.width/resizeFactor, image.height/resizeFactor);
	}

    /**
     * Instantiates a new CropperUI component.
     * 
     * @param {Object} container the DOM element in which the Image Editor lives
     * @param {Object} options configuration options for the component.
     */
    fluid.cropperUI = function (container, options) {
        var that = fluid.initView("fluid.cropperUI", container, options);

		// initialize our canvas, add a ghost canvas, set draw loop
		// then add everything we want to intially exist on the canvas
		that.init = function(a_canvas, a_resizeFactor, a_image, a_imageX, a_imageY) {
			canvas = a_canvas;
			HEIGHT = canvas.height;
			WIDTH = canvas.width;
			ctx = canvas.getContext('2d');
			resizeFactor = a_resizeFactor;
			image = a_image;
			imageX = a_imageX;
			imageY = a_imageY;
		
			ghostcanvas = document.createElement('canvas');
			ghostcanvas.height = HEIGHT;
			ghostcanvas.width = WIDTH;
			gctx = ghostcanvas.getContext('2d');
		
			//fixes a problem where double clicking causes text to get selected on the canvas
			canvas.onselectstart = function () {
				return false;
			}
			// fixes mouse co-ordinate problems when there's a border or padding
			// see getMouse for more detail
			if (document.defaultView && document.defaultView.getComputedStyle) {
				stylePaddingLeft = parseInt(document.defaultView.getComputedStyle(canvas, null)['paddingLeft'], 10)     || 0;
				stylePaddingTop  = parseInt(document.defaultView.getComputedStyle(canvas, null)['paddingTop'], 10)      || 0;
				styleBorderLeft  = parseInt(document.defaultView.getComputedStyle(canvas, null)['borderLeftWidth'], 10) || 0;
				styleBorderTop   = parseInt(document.defaultView.getComputedStyle(canvas, null)['borderTopWidth'], 10)  || 0;
			}
		
			// make mainDraw() fire every INTERVAL milliseconds
			var cropperID = setInterval(mainDraw, INTERVAL);
		
			// set our events. Up and down are for dragging,
			// double click is for making new boxes
			canvas.onmousedown = cropperMouseDown;
			canvas.onmouseup = cropperMouseUp;
			canvas.onmousemove = cropperMouseMove;
		
			// set up the selection handle boxes
			for (var i = 0; i < 8; i ++) {
				var rect = new Box2;
				selectionHandles.push(rect);
			}
		
			// add the rectangle for cropping area
			addRect(240, 120, 40, 40, 'rgba(2,165,165,0.0)');
			
			return cropperID;
		
		}
		
			
		that.reset = function() {
			boxes2 = [];
			canvas.onmousedown = null;
			canvas.onmouseup = null;
			canvas.onmousemove = null;
		}
        
        return that;
    };

    fluid.defaults("fluid.cropperUI", {
        gradeNames: "fluid.viewComponent",
        selectors: {
        },
        
        styles: {
        },
        
        //TODO: Change as needed
        strings: {
        },
        
        // progress display and hide animations, use the jQuery animation primatives, set to false to use no animation
        // animations must be symetrical (if you hide with width, you'd better show with width) or you get odd effects
        // see jQuery docs about animations to customize
        showAnimation: {
            params: {
                opacity: "show"
            }, 
            duration: "slow",
            //callback has been deprecated and will be removed as of 1.5, instead use onProgressBegin event 
            callback: null 
        }, // equivalent of $().fadeIn("slow")
        
        hideAnimation: {
            params: {
                opacity: "hide"
            }, 
            duration: "slow", 
            //callback has been deprecated and will be removed as of 1.5, instead use afterProgressHidden event 
            callback: null
        }, // equivalent of $().fadeOut("slow")
        
        events: {            
            onProgressBegin: null,
            afterProgressHidden: null            
        },

        minWidth: 5, // 0 length indicators can look broken if there is a long pause between updates
        delay: 0, // the amount to delay the fade out of the progress
        speed: 200, // default speed for animations, pretty fast
        animate: "forward", // suppport "forward", "backward", and "both", any other value is no animation either way
        initiallyHidden: true, // supports progress indicators which may always be present
        updatePosition: false
    });
    //we'll put our default options here

})(jQuery, fluid_1_4);
