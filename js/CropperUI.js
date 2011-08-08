/*
Copyright 2011 OCAD University

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

/**************
 * Cropper UI *
 **************/

(function ($, fluid) {

	// Holds the 8 tiny boxes that will be our selection handles
	// the selection handles will be in this order:
	// 0  1  2
	// 3     4
	// 5  6  7
	var selectionHandles = [];

	// var resizeFactor;
	// var image;
	var INTERVAL = 20;  // how often, in milliseconds, we check to see if a redraw is needed
	// var imageX;
	// var imageY;

	var isDrag = false;
	var isResizeDrag = false;
	var expectResize = -1; // Will save the # of the selection handle if the mouse is over one.
	var mx, my; // mouse coordinates

	var cropperID;	//ID returned from setInterval

	// when set to true, the canvas will redraw everything
	// invalidate() just sets this to false right now
	// we want to call invalidate() whenever we make a change
	var canvasValid = false;

	// The node (if any) being selected.
	var mySel = null;

	var blurStyle = 'rgba(255,255,255,0.4)';

	// we use a fake canvas to draw individual shapes for selection testing
	var ghostcanvas;
	var gctx; // fake canvas context

	// since we can drag from anywhere in a node
	// instead of just its x/y corner, we need to save
	// the offset of the mouse when we start dragging.
	var offsetx, offsety;

	// Padding and border style widths for mouse offsets
	var stylePaddingLeft, stylePaddingTop, styleBorderLeft, styleBorderTop;

	var invalidate = function () {
		canvasValid = false;
	};
	var setupSelectionHandles = function(that, box) {
		var half = that.options.selBoxSize / 2;

		// 0  1  2
		// 3     4
		// 5  6  7

		// top left, middle, right
		selectionHandles[0].x = box.x - half;
		selectionHandles[0].y = box.y - half;

		selectionHandles[1].x = box.x + box.w / 2 - half;
		selectionHandles[1].y = box.y - half;

		selectionHandles[2].x = box.x + box.w - half;
		selectionHandles[2].y = box.y - half;

		//middle left
		selectionHandles[3].x = box.x - half;
		selectionHandles[3].y = box.y + box.h / 2 - half;

		//middle right
		selectionHandles[4].x = box.x + box.w - half;
		selectionHandles[4].y = box.y + box.h / 2 - half;

		//bottom left, middle, right
		selectionHandles[6].x = box.x + box.w / 2 - half;
		selectionHandles[6].y = box.y + box.h - half;

		selectionHandles[5].x = box.x - half;
		selectionHandles[5].y = box.y + box.h - half;

		selectionHandles[7].x = box.x + box.w - half;
		selectionHandles[7].y = box.y + box.h - half;

		for (var i = 0; i < 8; ++i) {
			selectionHandles[i].h = that.options.selBoxSize;
			selectionHandles[i].w = that.options.selBoxSize;
		}
	};
	var drawSelectionHandles = function (that, context) {
		context.fillStyle = that.options.selBoxColor;
		for (var i = 0; i < 8; i++) {
			var cur = selectionHandles[i];
			context.fillRect(cur.x, cur.y, that.options.selBoxSize, that.options.selBoxSize);
		}
	};
	// Box object to hold data
	function Box() {
		this.x = 0;
		this.y = 0;
		this.w = 1; // default width and height?
		this.h = 1;
		this.fill = '#444444';
	}

	Box.prototype = {
		highlight: function (that, context) {
			context.strokeStyle = that.options.highlightColor;
			context.lineWidth = that.options.borderWidth;
			context.strokeRect(this.x, this.y, this.w, this.h);
		},
		
		// mainDraw() will call this with the normal canvas
		draw: function (that, context, optionalColor) {
			if (context === gctx) {
				context.fillStyle = 'black'; // always want black for the ghost canvas
			} else {
				context.fillStyle = this.fill;
			}

			// We can skip the drawing of elements that have moved off the screen:
			if (this.x > that.canvas.width || this.y > that.canvas.height) {
				return;
			}
			if (this.x + this.w < 0 || this.y + this.h < 0) {
				return;
			}

			var tempX, tempY, tempH, tempW;

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
			context.fillRect(this.x, this.y, this.w, this.h);

			//draw blurred area around the rectangle
			context.fillStyle = blurStyle;
			context.fillRect(0, 0, that.canvas.width, tempY);
			context.fillRect(0, tempY, tempX, that.canvas.height - tempY);
			context.fillRect(tempX + tempW, tempY, that.canvas.width - (tempX + tempW), that.canvas.height - tempY);
			context.fillRect(tempX, tempY + tempH, tempW, that.canvas.height - tempY);

			// draw selection
			// this is a stroke along the box and also 8 new selection handles
			if (mySel === this) {
				context.strokeStyle = that.options.borderColor;
				context.lineWidth = that.options.borderWidth;
				context.strokeRect(this.x, this.y, this.w, this.h);

				// draw the selection handles
				setupSelectionHandles(that, this);
				drawSelectionHandles(that, context);

			}
		} // end draw
	};

	var drawImage = function (that, imageCanvasContext, image, resizeFactor) {
		imageCanvasContext.drawImage(image, that.imageX, that.imageY, image.width / resizeFactor, image.height / resizeFactor);
	};
	//wipes the canvas context
	var clear = function (that, context) {
		context.clearRect(0, 0, that.canvas.width, that.canvas.height);
	};
	// Sets mx,my to the mouse position relative to the canvas
	// unfortunately this can be tricky, we have to worry about padding and borders
	var getMouse = function (that, e) {
		var element = that.canvas, offsetX = 0, offsetY = 0;

		if (element.offsetParent) {
			do {
				offsetX += element.offsetLeft;
				offsetY += element.offsetTop;
				element = element.offsetParent;
			} while (element);
		}

		// Add padding and border style widths to offset
		offsetX += stylePaddingLeft;
		offsetY += stylePaddingTop;

		offsetX += styleBorderLeft;
		offsetY += styleBorderTop;

		mx = e.pageX - offsetX;
		my = e.pageY - offsetY;
	};
	var cropImage = function (that, image, x, y, w, h) {

		//Map x, y, w, h to account for resizeRatio
		x *= that.resizeFactor;
		y *= that.resizeFactor;
		w *= that.resizeFactor;
		h *= that.resizeFactor;

		//Create canvas to get cropped image pixels
		var imageManipulationCanvas = document.createElement('canvas');
		imageManipulationCanvas.height = h;
		imageManipulationCanvas.width = w;
		var imageManipulationCtx = imageManipulationCanvas.getContext('2d');
		imageManipulationCtx.drawImage(image, x, y, w, h, 0, 0, w, h); // Draw cropped image on temporary canvas
		var croppedImageDataURL = imageManipulationCanvas.toDataURL();	//get DataURL for cropped image
		return croppedImageDataURL;

	};
	var handleResize = function(oldx, oldy, that) {
		// 0  1  2
		// 3     4
		// 5  6  7
		switch (expectResize) {
			case 0:
				mySel.x = mx;
				that.events.onChangeLocationX.fire(mySel.x);
				mySel.y = my;
				that.events.onChangeLocationY.fire(mySel.y);
				mySel.w += oldx - mx;
				that.events.onChangeWidth.fire(mySel.w);
				mySel.h += oldy - my;
				that.events.onChangeHeight.fire(mySel.h);
				that.events.afterChangeModel.fire(mySel);
				break;
			case 1:
				mySel.y = my;
				that.events.onChangeLocationY.fire(mySel.y);
				mySel.h += oldy - my;
				that.events.onChangeHeight.fire(mySel.h);
				that.events.afterChangeModel.fire(mySel);
				break;
			case 2:
				mySel.y = my;
				that.events.onChangeLocationY.fire(mySel.y);
				mySel.w = mx - oldx;
				that.events.onChangeWidth.fire(mySel.w);
				mySel.h += oldy - my;
				that.events.onChangeHeight.fire(mySel.h);
				that.events.afterChangeModel.fire(mySel);
				break;
			case 3:
				mySel.x = mx;
				that.events.onChangeLocationX.fire(mySel.x);
				mySel.w += oldx - mx;
				that.events.onChangeWidth.fire(mySel.w);
				that.events.afterChangeModel.fire(mySel);
				break;
			case 4:
				mySel.w = mx - oldx;
				that.events.onChangeWidth.fire(mySel.w);
				that.events.afterChangeModel.fire(mySel);
				break;
			case 5:
				mySel.x = mx;
				that.events.onChangeLocationX.fire(mySel.x);
				mySel.w += oldx - mx;
				that.events.onChangeWidth.fire(mySel.w);
				mySel.h = my - oldy;
				that.events.onChangeHeight.fire(mySel.h);
				that.events.afterChangeModel.fire(mySel);
				break;
			case 6:
				mySel.h = my - oldy;
				that.events.onChangeHeight.fire(mySel.h);
				that.events.afterChangeModel.fire(mySel);
				break;
			case 7:
				mySel.w = mx - oldx;
				that.events.onChangeWidth.fire(mySel.w);
				mySel.h = my - oldy;
				that.events.onChangeHeight.fire(mySel.h);
				that.events.afterChangeModel.fire(mySel);
				break;
		}
	};
	var handleResizeByKeyboard = function (that) {
		// 0  1  2
		// 3     4
		// 5  6  7
		if (that.keyboardLeftDown) {
			if (that.highlightedSelectionHandleIndex == 8) {
				that.box.x--;
				that.events.onChangeLocationX.fire(that.box.x);
				invalidate();
			} else if (that.highlightedSelectionHandleIndex == 0 || that.highlightedSelectionHandleIndex == 3 || that.highlightedSelectionHandleIndex == 5) {
				if (that.box.x > 0) {	// to prevent the selection box to go beyond the canvas boundary.						
					that.box.x--;
					that.events.onChangeLocationX.fire(that.box.x);
					that.box.w++;
					that.events.onChangeWidth.fire(that.box.w);
					invalidate();
				}
			} else if (that.highlightedSelectionHandleIndex == 2 || that.highlightedSelectionHandleIndex == 4 || that.highlightedSelectionHandleIndex == 7) {
				that.box.w--;
				that.events.onChangeWidth.fire(that.box.w);
				invalidate();
			}
		}

		if (that.keyboardUpDown) {
			if (that.highlightedSelectionHandleIndex == 8) {
				that.box.y--;
				that.events.onChangeLocationY.fire(that.box.y);
				invalidate();
			} else if (that.highlightedSelectionHandleIndex == 0 || that.highlightedSelectionHandleIndex == 1 || that.highlightedSelectionHandleIndex == 2) {
				if (that.box.y > 0) {	// to prevent the selection box to go beyond the canvas boundary.
					that.box.y--;
					that.events.onChangeLocationY.fire(that.box.y);
					that.box.h++;
					that.events.onChangeHeight.fire(that.box.h);
					invalidate();
				}
			} else if (that.highlightedSelectionHandleIndex == 5 || that.highlightedSelectionHandleIndex == 6 || that.highlightedSelectionHandleIndex == 7) {
				that.box.h--;
				that.events.onChangeHeight.fire(that.box.h);
				invalidate();
			}
		}

		if (that.keyboardRightDown) {
			if (that.highlightedSelectionHandleIndex == 8) {
				that.box.x++;
				that.events.onChangeLocationX.fire(that.box.x);
				invalidate();
			} else if (that.highlightedSelectionHandleIndex == 0 || that.highlightedSelectionHandleIndex == 3 || that.highlightedSelectionHandleIndex == 5) {
				that.box.x++;
				that.events.onChangeLocationX.fire(that.box.x);
				that.box.w--;
				that.events.onChangeWidth.fire(that.box.w);
				invalidate();
			} else if (that.highlightedSelectionHandleIndex == 2 || that.highlightedSelectionHandleIndex == 4 || that.highlightedSelectionHandleIndex == 7) {
				if (that.box.x + that.box.w < that.canvas.width) {	// to prevent the selection box to go beyond the canvas boundary.
					that.box.w++;
					that.events.onChangeWidth.fire(that.box.w);
					invalidate();
				}
			}
		}

		if (that.keyboardDownDown) {
			if (that.highlightedSelectionHandleIndex == 8) {
				that.box.y++;
				that.events.onChangeLocationY.fire(that.box.y);
				invalidate();
			} else if (that.highlightedSelectionHandleIndex == 0 || that.highlightedSelectionHandleIndex == 1 || that.highlightedSelectionHandleIndex == 2) {
				that.box.y++;
				that.events.onChangeLocationY.fire(that.box.y);
				that.box.h--;
				that.events.onChangeHeight.fire(that.box.h);
				invalidate();
			} else if (that.highlightedSelectionHandleIndex == 5 || that.highlightedSelectionHandleIndex == 6 || that.highlightedSelectionHandleIndex == 7) {
				if (that.box.y + that.box.h < that.canvas.height) {	// to prevent the selection box to go beyond the canvas boundary.
					that.box.h++;
					that.events.onChangeHeight.fire(that.box.h);
					invalidate();
				}
			}
		}
		that.events.afterChangeModel.fire(that.box);

	};
	var setCursorForHandles = function (style, i) {
		switch (i) {
			case 0:
				style.cursor = 'nw-resize';
				break;
			case 1:
				style.cursor = 'n-resize';
				break;
			case 2:
				style.cursor = 'ne-resize';
				break;
			case 3:
				style.cursor = 'w-resize';
				break;
			case 4:
				style.cursor = 'e-resize';
				break;
			case 5:
				style.cursor = 'sw-resize';
				break;
			case 6:
				style.cursor = 's-resize';
				break;
			case 7:
				style.cursor = 'se-resize';
				break;
		}
	};
	
	var bindComponentEvents = function (that) {
		
		that.events.afterChangeModel.addListener(function (newModel) {
			var modelModified = false;
			if (that.box != null) {
				if (newModel.y + Math.floor(newModel.h) > that.canvas.height) {
					that.box.y = that.canvas.height - Math.floor(newModel.h);
					that.events.onChangeLocationY.fire(that.box.y);
					modelModified = true;
				}
				if (newModel.x + Math.floor(newModel.w) > that.canvas.width) {
					that.box.x = that.canvas.width - Math.floor(newModel.w);
					that.events.onChangeLocationX.fire(that.box.x);
					modelModified = true;
				}
				if (newModel.x < 0) {
					that.box.x = 0;
					that.events.onChangeLocationX.fire(that.box.x);
					modelModified = true;
				}
				if (newModel.y < 0) {
					that.box.y = 0;
					that.events.onChangeLocationY.fire(that.box.y);
					modelModified = true;
				}
			}
			if (modelModified) {
				invalidate();
				that.events.afterChangeModel.fire(newModel);
			}
		});
	};
	
	/**
	 * Instantiates a new CropperUI component.
	 *
	 * @param {Object} container the DOM element in which the TaggerUI lives
	 * @param {Object} options configuration options for the component.
	 */
	fluid.cropperUI = function (container, options) {
		var that = fluid.initView("fluid.cropperUI", container, options);

		// Main draw loop.
		// While draw is called as often as the INTERVAL variable demands,
		// It only ever does something if the canvas gets invalidated by our code
		var mainDraw = function () {
			if (that.canvas && canvasValid === false) {
				clear(that, that.context);
				drawImage(that, that.context, that.image, that.resizeFactor, that.imageX, that.imageY);
				if (that.box != null) {
					that.box.draw(that, that.context);
				}
				canvasValid = true;
			}
			if (that.keyHandlerActivated) {
				if (that.highlightedSelectionHandleIndex != null && that.highlightedSelectionHandleIndex != 8) {
					selectionHandles[that.highlightedSelectionHandleIndex].highlight(that, that.context);
				} else if (that.highlightedSelectionHandleIndex != null && that.highlightedSelectionHandleIndex == 8) {
					if (that.box != null) {
						that.box.highlight(that, that.context);
					}
				}
			}
		};
		// initialize our canvas, add a ghost canvas, set draw loop
		// then add everything we want to intially exist on the canvas
		that.init = function (canvas, resizeFactor, image, imageX, imageY, a_rectX, a_rectY, a_rectW, a_rectH) {
			that.canvas = canvas;
			that.context = that.canvas.getContext('2d');
			that.resizeFactor = resizeFactor;
			that.image = image;
			that.imageX = imageX;
			that.imageY = imageY;

			ghostcanvas = document.createElement('canvas');
			ghostcanvas.height = that.canvas.height;
			ghostcanvas.width = that.canvas.width;
			gctx = ghostcanvas.getContext('2d');

			that.highlightedSelectionHandleIndex = 0;
			that.keyboardLeftDown = false;
			that.keyboardUpDown = false;
			that.keyboardRightDown = false;
			that.keyboardDownDown = false;
			that.keyHandlerActivated = false;

			//fixes a problem where double clicking causes text to get selected on the canvas
			that.canvas.onselectstart = function () {
				return false;
			};
			// fixes mouse co-ordinate problems when there's a border or padding
			// see getMouse for more detail
			if (document.defaultView && document.defaultView.getComputedStyle) {
				stylePaddingLeft = parseInt(document.defaultView.getComputedStyle(that.canvas, null).paddingLeft, 10)     || 0;
				stylePaddingTop  = parseInt(document.defaultView.getComputedStyle(that.canvas, null).paddingTop, 10)      || 0;
				styleBorderLeft  = parseInt(document.defaultView.getComputedStyle(that.canvas, null).borderLeftWidth, 10) || 0;
				styleBorderTop   = parseInt(document.defaultView.getComputedStyle(that.canvas, null).borderTopWidth, 10)  || 0;
			}

			// make mainDraw() fire every INTERVAL milliseconds
			cropperID = setInterval(mainDraw, INTERVAL);

			// Happens when the mouse is clicked in the canvas
			var cropperMouseDown = function (e) {
				getMouse(that, e);

				clear(that, gctx);
				that.box.draw(that, gctx, 'black');

				//we are over a selection box
				if (expectResize !== -1) {
					isResizeDrag = true;
					return;
				}
				
				var mouseInBox = false;
				if (that.box != null) {
					if (mx >= that.box.x && mx <= that.box.x + that.box.w && my >= that.box.y && my <= that.box.y + that.box.h) {
						mySel = that.box;
						offsetx = mx - mySel.x;
						offsety = my - mySel.y;
						mySel.x = mx - offsetx;
						mySel.y = my - offsety;
						isDrag = true;
						mouseInBox = true;
						invalidate();
						clear(that, gctx);
					}
				}
				if (!mouseInBox) {
					isDrag = false;
				}

				
			};
			var cropperMouseUp = function () {
				isDrag = false;
				isResizeDrag = false;
				expectResize = -1;

				if (mySel) {
					if (mySel.h < 0) {
						mySel.y += mySel.h;
						that.events.onChangeLocationY.fire(mySel.y);
						mySel.h *= -1;
						that.events.onChangeHeight.fire(mySel.h);
					}

					if (mySel.w < 0) {
						mySel.x += mySel.w;
						that.events.onChangeLocationX.fire(mySel.x);
						mySel.w *= -1;
						that.events.onChangeWidth.fire(mySel.w);
					}
					
					that.events.afterChangeModel.fire(mySel);
				}
			};
			// Happens when the mouse is moving inside the canvas
			var cropperMouseMove = function (e) {
				if (isDrag) {
					getMouse(that, e);
					mySel.x = mx - offsetx;
					that.events.onChangeLocationX.fire(mySel.x);
					mySel.y = my - offsety;
					that.events.onChangeLocationY.fire(mySel.y);
					that.events.afterChangeModel.fire(mySel);
					invalidate();
				} else if (isResizeDrag) {
					// time ro resize!
					var oldx = mySel.x;
					var oldy = mySel.y;
					handleResize(oldx, oldy, that);
					invalidate();
				}

				getMouse(that, e);

				var mouseInBox = false;
				if (that.box != null) {
					if (mx >= that.box.x && mx <= that.box.x + that.box.w && my >= that.box.y && my <= that.box.y + that.box.h) {
						this.style.cursor = 'move';
						mouseInBox = true;
					}
				}
				if (!mouseInBox) {
					this.style.cursor = 'auto';
				}

				// if there's a selection see if we grabbed one of the selection handles
				if (mySel !== null && !isResizeDrag) {
					for (i = 0; i < 8; i++) {
						// 0  1  2
						// 3     4
						// 5  6  7
						var cur = selectionHandles[i];
						// we dont need to use the ghost context because
						// selection handles will always be rectangles
						if (mx >= cur.x && mx <= cur.x + that.options.selBoxSize &&
						my >= cur.y && my <= cur.y + that.options.selBoxSize) {
							expectResize = i;
							invalidate();
							setCursorForHandles(this.style, i);
							return;
						}

					}
					// not over a selection box, return to normal
					isResizeDrag = false;
					expectResize = -1;
				}
			};
			
			// set our events. Up and down are for dragging,
			that.canvas.onmousedown = cropperMouseDown;
			that.canvas.onmouseup = cropperMouseUp;
			that.canvas.onmousemove = cropperMouseMove;

			// set up the selection handle boxes
			for (var i = 0; i < 8; i++) {
				var rect = new Box();
				selectionHandles.push(rect);
			}

			a_rectX = a_rectX ? a_rectX : that.imageX;
			a_rectY = a_rectY ? a_rectY : that.imageY;
			a_rectW = a_rectW ? a_rectW : that.image.width / that.resizeFactor;
			a_rectH = a_rectH ? a_rectH : that.image.height / that.resizeFactor;

			//Initialize a new Box, add it, and invalidate the canvas
			var addRect = function (x, y, w, h, fill) {
				var rect = new Box();
				rect.x = x;
				that.events.onChangeLocationX.fire(rect.x);
				rect.y = y;
				that.events.onChangeLocationY.fire(rect.y);
				rect.w = w;
				that.events.onChangeWidth.fire(rect.w);
				rect.h = h;
				that.events.onChangeHeight.fire(rect.h);
				rect.fill = fill;
				that.box = rect;
				that.events.afterChangeModel.fire(that.box);
				mySel = that.box;
				invalidate();
			};
			// add the rectangle for cropping area
			addRect(a_rectX, a_rectY, a_rectW, a_rectH, 'rgba(2,165,165,0.0)');
			
			bindComponentEvents(that);
		};
		
		var cropperKeyDown = function (evt) {
			switch (evt.which) {
				case 9:
					// TAB Key
					evt.preventDefault();
					that.highlightedSelectionHandleIndex = (++that.highlightedSelectionHandleIndex) % 9;	// 8 is for selecting the box
					invalidate();
					break;
				case 37:
					// Left Arrow
					that.keyboardLeftDown = true;
					handleResizeByKeyboard(that);
					break;
				case 38:
					// Up Arrow
					that.keyboardUpDown = true;
					handleResizeByKeyboard(that);
					break;
				case 39:
					// Right Arrow
					that.keyboardRightDown = true;
					handleResizeByKeyboard(that);
					break;
				case 40:
					// Down Arrow
					that.keyboardDownDown = true;
					handleResizeByKeyboard(that);
					break;
			}
		};
		var cropperKeyUp = function (evt) {
			switch (evt.which) {
				case 37:
					// Left Arrow
					that.keyboardLeftDown = false;
					break;
				case 38:
					// Up Arrow
					that.keyboardUpDown = false;
					break;
				case 39:
					// Right Arrow
					that.keyboardRightDown = false;
					break;
				case 40:
					// Down Arrow
					that.keyboardDownDown = false;
					break;
			}
		};
		
		that.activateKeyboardAccessibility = function () {
			if (!that.keyHandlerActivated) {
				that.keyHandlerActivated = true;
				$(document).keydown(cropperKeyDown);
				$(document).keyup(cropperKeyUp);
			}
		};
		
		that.reset = function (isNotForCrop) {

			var croppingDimensions = {};
			var croppedImageDataURL;

			if (that.box != null) {
				croppingDimensions.x = that.box.x - that.imageX;
				croppingDimensions.y = that.box.y - that.imageY;
				croppingDimensions.w = that.box.w;
				croppingDimensions.h = that.box.h;
				if (!isNotForCrop) {
					croppedImageDataURL = cropImage(that, that.image, croppingDimensions.x, croppingDimensions.y, croppingDimensions.w, croppingDimensions.h);
				}
			}

			if (cropperID) {
				clearInterval(cropperID);
			}

			that.box = null;
			if (that.canvas) {
				that.canvas.style.cursor = 'auto';
				that.canvas.onmousedown = null;
				that.canvas.onmouseup = null;
				that.canvas.onmousemove = null;
				$(document).unbind('keydown');
				$(document).unbind('keyup');
			}
			if (isNotForCrop) {
				invalidate();
				mainDraw();
			}

			return [croppedImageDataURL, croppingDimensions];

		};
		that.setLocationX = function (newLocationX) {
			if (that.box != null) {
				that.box.x = newLocationX;
				that.events.onChangeLocationX.fire(that.box.x);
				that.events.afterChangeModel.fire(that.box);
				invalidate();
			} else {
				return false;
			}
			return true;
		};
		that.setLocationY = function (newLocationY) {
			if (that.box != null) {
				that.box.y = newLocationY;
				that.events.onChangeLocationY.fire(that.box.y);
				that.events.afterChangeModel.fire(that.box);
				invalidate();
			} else {
				return false;
			}
			return true;
		};
		that.setWidth = function (newWidth, isFixedRatioOn) {
			if (that.box != null) {
				if (isFixedRatioOn) {
					that.box.h = newWidth / that.box.w * that.box.h;
					that.events.onChangeHeight.fire(that.box.h);
				}
				that.box.w = newWidth;
				that.events.onChangeWidth.fire(that.box.w);
				that.events.afterChangeModel.fire(that.box);
				invalidate();
			} else {
				return false;
			}
			return true;
		};
		that.setHeight = function (newHeight, isFixedRatioOn) {
			if (that.box != null) {
				if (isFixedRatioOn) {
					that.box.w = newHeight / that.box.h * that.box.w;
					that.events.onChangeWidth.fire(that.box.w);
				}
				that.box.h = newHeight;
				that.events.onChangeHeight.fire(that.box.h);
				that.events.afterChangeModel.fire(that.box);
				invalidate();
			} else {
				return false;
			}
			return true;
		};
		return that;
	};
	fluid.defaults("fluid.cropperUI", {
		gradeNames: "fluid.viewComponent",
		events: {
			onChangeHeight: null,
			onChangeWidth: null,
			onChangeLocationX: null,
			onChangeLocationY: null,
			afterChangeModel: null
		},
		selBoxSize: 6,
		selBoxColor: 'darkred',
		borderColor: '#CC0000',
		borderWidth: 0, 
		highlightColor: 'yellow'
	});

})(jQuery, fluid_1_4);