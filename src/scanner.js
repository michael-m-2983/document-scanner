/**
 * This is based on the jscanify package: https://github.com/puffinsoft/jscanify/tree/master
 * 
 * The package cannot be used directly because it has extraneous NPM dependencies that break things
 */

import download from "downloadjs";


function distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

export class Scanner {

    constructor(cv) {
        this.cv = cv;
    }

    /**
     * Finds the contour of the paper within the image
     * 
     * TODO (various improvements):
     *  - Filter out rectangles that have very wrong aspect ratios
     *  - Use the QR code on rocketbooks if it is present
     *  - See if colors can be used to make this more accurate
     *  - 
     * 
     * @param {*} img image to process (cv.Mat)
     * @returns the biggest contour inside the image
     */
    findPaperContour(img) {

        const cv = this.cv;

        const imgGray = new cv.Mat();
        cv.Canny(img, imgGray, 50, 200);

        const imgBlur = new cv.Mat();
        cv.GaussianBlur(
            imgGray,
            imgBlur,
            new cv.Size(3, 3),
            0,
            0,
            cv.BORDER_DEFAULT
        );

        const imgThresh = new cv.Mat();
        cv.threshold(
            imgBlur,
            imgThresh,
            0,
            255,
            cv.THRESH_OTSU
        );

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();

        cv.findContours(
            imgThresh,
            contours,
            hierarchy,
            cv.RETR_CCOMP,
            cv.CHAIN_APPROX_TC89_L1
        );

        // let contourData = [];
        // for(let i = 0; i < contours.size(); ++i) {
        //     let contour = contours.get(i);

        //     contourData.push({
        //         index: i,
        //         contour: contour,
        //         area: cv.contourArea(contour)
        //     })
        // }
        // download(JSON.stringify(contourData), "contours.json", "application/json");
        // window.location.href = "https://duckduckgo.com/sdfdfasdf"

        let maxArea = 0;
        let maxContourIndex = -1;
        for (let i = 0; i < contours.size(); ++i) {
            let contourArea = cv.contourArea(contours.get(i));
            if (contourArea > maxArea && contourArea <= 0.8 * img.rows * img.cols) {
                maxArea = contourArea;
                maxContourIndex = i;
            }
        }

        const maxContour =
            maxContourIndex >= 0 ?
                contours.get(maxContourIndex) :
                null;

        imgGray.delete();
        imgBlur.delete();
        imgThresh.delete();
        contours.delete();
        hierarchy.delete();
        return maxContour;
    }

    /**
     * Highlights the paper detected inside the image.
     * @param {*} image image to process
     * @param {*} options options for highlighting. Accepts `color` and `thickness` parameter
     * @returns `HTMLCanvasElement` with original image and paper highlighted
     */
    highlightPaper(image, options) {

        const cv = this.cv;

        options = options || {};
        options.color = options.color || "orange";
        options.thickness = options.thickness || 10;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = cv.imread(image);

        const maxContour = this.findPaperContour(img);
        cv.imshow(canvas, img);
        if (maxContour) {
            const {
                topLeftCorner,
                topRightCorner,
                bottomLeftCorner,
                bottomRightCorner,
            } = this.getCornerPoints(maxContour);

            if (
                topLeftCorner &&
                topRightCorner &&
                bottomLeftCorner &&
                bottomRightCorner
            ) {
                ctx.strokeStyle = options.color;
                ctx.lineWidth = options.thickness;
                ctx.beginPath();
                ctx.moveTo(...Object.values(topLeftCorner));
                ctx.lineTo(...Object.values(topRightCorner));
                ctx.lineTo(...Object.values(bottomRightCorner));
                ctx.lineTo(...Object.values(bottomLeftCorner));
                ctx.lineTo(...Object.values(topLeftCorner));
                ctx.stroke();
            }
        }

        img.delete();
        return canvas;
    }

    //TODO: make this work better
    validateContour(contour) {

        if(!contour) return false;

        const {
            topLeftCorner,
            topRightCorner,
            bottomLeftCorner,
            bottomRightCorner,
        } = this.getCornerPoints(contour);

        if(!topLeftCorner || !topRightCorner || !bottomLeftCorner || !bottomRightCorner) return false;

        let distance_top = distance(topLeftCorner, topRightCorner);
        let distance_left = distance(topLeftCorner, bottomLeftCorner);
        let distance_right = distance(topRightCorner, bottomRightCorner);
        let distance_bottom = distance(bottomLeftCorner, bottomRightCorner);

        // 1.2 seems like a good estimate
        let aspect_ratio = ((distance_right + distance_left) / 2) / ((distance_top + distance_bottom) / 2);

        if (aspect_ratio > 1.45 || aspect_ratio < 0.55) return false;

        let vertical_error = distance_left / distance_top;
        if (vertical_error > 1.6) return false;

        let horizontal_error = distance_top / distance_bottom;
        if (horizontal_error < 0.5 || horizontal_error > 2) return false;

        return true;
    }

    /**
     * Extracts and undistorts the image detected within the frame.
     * 
     * Returns `null` if no paper is detected.
     *  
    * @param {*} image image to process
     * @param {*} resultWidth desired result paper width
     * @param {*} resultHeight desired result paper height
     * @param {*} cornerPoints optional custom corner points, in case automatic corner points are incorrect
     * @returns `HTMLCanvasElement` containing undistorted image
     */
    extractPaper(image, resultWidth, resultHeight, cornerPoints) {

        const cv = this.cv;

        const canvas = document.createElement("canvas");
        const img = cv.imread(image);
        const maxContour = cornerPoints ? null : this.findPaperContour(img);

        if (maxContour == null && cornerPoints === undefined) {
            return null;
        }

        const {
            topLeftCorner,
            topRightCorner,
            bottomLeftCorner,
            bottomRightCorner,
        } = cornerPoints || this.getCornerPoints(maxContour);
        let warpedDst = new cv.Mat();

        let dsize = new cv.Size(resultWidth, resultHeight);
        let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            topLeftCorner.x,
            topLeftCorner.y,
            topRightCorner.x,
            topRightCorner.y,
            bottomLeftCorner.x,
            bottomLeftCorner.y,
            bottomRightCorner.x,
            bottomRightCorner.y,
        ]);

        let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0,
            0,
            resultWidth,
            0,
            0,
            resultHeight,
            resultWidth,
            resultHeight,
        ]);

        let M = cv.getPerspectiveTransform(srcTri, dstTri);
        cv.warpPerspective(
            img,
            warpedDst,
            M,
            dsize,
            cv.INTER_LINEAR,
            cv.BORDER_CONSTANT,
            new cv.Scalar()
        );

        cv.imshow(canvas, warpedDst);

        img.delete()
        warpedDst.delete()
        return canvas;
    }

    /**
     * Calculates the corner points of a contour.
     * @param {*} contour contour from {@link findPaperContour}
     * @returns object with properties `topLeftCorner`, `topRightCorner`, `bottomLeftCorner`, `bottomRightCorner`, each with `x` and `y` property
     */
    getCornerPoints(contour) {

        const cv = this.cv;

        let rect = cv.minAreaRect(contour);
        const center = rect.center;

        let topLeftCorner;
        let topLeftCornerDist = 0;

        let topRightCorner;
        let topRightCornerDist = 0;

        let bottomLeftCorner;
        let bottomLeftCornerDist = 0;

        let bottomRightCorner;
        let bottomRightCornerDist = 0;

        for (let i = 0; i < contour.data32S.length; i += 2) {
            const point = { x: contour.data32S[i], y: contour.data32S[i + 1] };
            const dist = distance(point, center);
            if (point.x < center.x && point.y < center.y) {
                // top left
                if (dist > topLeftCornerDist) {
                    topLeftCorner = point;
                    topLeftCornerDist = dist;
                }
            } else if (point.x > center.x && point.y < center.y) {
                // top right
                if (dist > topRightCornerDist) {
                    topRightCorner = point;
                    topRightCornerDist = dist;
                }
            } else if (point.x < center.x && point.y > center.y) {
                // bottom left
                if (dist > bottomLeftCornerDist) {
                    bottomLeftCorner = point;
                    bottomLeftCornerDist = dist;
                }
            } else if (point.x > center.x && point.y > center.y) {
                // bottom right
                if (dist > bottomRightCornerDist) {
                    bottomRightCorner = point;
                    bottomRightCornerDist = dist;
                }
            }
        }

        return {
            topLeftCorner,
            topRightCorner,
            bottomLeftCorner,
            bottomRightCorner,
        };
    }
}