import React, { useEffect, useRef, useState } from "react";
import cvModule from "@techstark/opencv-js";
import { Scanner } from "./scanner";
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import download from "downloadjs";

async function getOpenCV() {
    let cv;
    if (cvModule instanceof Promise) {
        cv = await cvModule;
    } else {
        await new Promise((resolve) => {
            cvModule.onRuntimeInitialized = () => resolve();
        });
        cv = cvModule;
    }
    return { cv };
}

export default function App() {

    const [cv, setCV] = useState(null);
    const [scanner, setScanner] = useState(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const intervalRef = useRef(null);

    const [images, setImages] = useState([]);


    const startVideo = async () => {
        try {

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                },
            });
            streamRef.current = stream;

            const waitForVideo = () =>
                new Promise(resolve => {
                    const check = () => {
                        if (videoRef.current) resolve();
                        else requestAnimationFrame(check);
                    };
                    check();
                });

            await waitForVideo();

            const video = videoRef.current;
            video.srcObject = stream;
            await video.play();

            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");

            intervalRef.current = setInterval(() => {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                try {
                    const resultCanvas = scanner.highlightPaper(canvas, {
                        color: 'rgb(255, 255, 255, 0.7)',
                        thickness: 5
                    });
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(resultCanvas, 0, 0);
                } catch (err) {
                    console.warn("Highlight error:", err);
                    alert("Highlight error: " + err.message)
                }
            }, 200);

        } catch (err) {
            //TODO: better error handling
            console.error("Cannot access camera! " + err.message);
            alert("ERROR: " + err.message);
        }
    };

    const stopVideo = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
    };

    useEffect(() => {
        if (!cv || !scanner) {
            getOpenCV().then(({ cv }) => {
                setCV(cv);
                setScanner(new Scanner(cv));
            })
        }


        return () => stopVideo()
    }, [cv, scanner, setCV, setScanner]);

    useEffect(() => {
        if (scanner) startVideo();
    }, [scanner]);

    //TODO: loading animation
    if (!scanner || !cv) return <p>Loading...</p>


    const savePage = () => {
        if (!scanner || !canvasRef.current) return;
        const canvas = canvasRef.current;

        try {
            const scan = scanner.extractPaper(canvas, 500, 700); //TODO: make this size dynamic
            const mat = cv.imread(canvas);
            const contour = scanner.findPaperContour(mat);
            const corners = scanner.getCornerPoints(contour);

            setImages([...images, scan.toDataURL()]);
        } catch (err) {
            alert("Capture failed. Try again.");
        }
    };

    const exportDocument = async () => {
        const pdfDoc = await PDFDocument.create()
        const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman)

        for (let i = 0; i < images.length; i++) {

            let page = pdfDoc.addPage();
            const width = page.getWidth();
            const height = page.getHeight();

            const image = images[i];
            const imageBytes = await fetch(image).then((res) => res.arrayBuffer());
            const imageEmbed = await pdfDoc.embedPng(imageBytes);

            const imageX = 0;
            const imageY = 0;
            const imageWidth = width;
            const imageHeight = height;

            
            page.drawImage(imageEmbed, {x: imageX, y: imageY, width: imageWidth, height: imageHeight});
        }

        pdfDoc.setTitle('Document')
        pdfDoc.setProducer('rocketbook-web')

        const pdfBytes = await pdfDoc.save()

        download(pdfBytes, "document.pdf", "application/pdf");
    }

    return <div>
        {/* live feed */}
        <div className="video-container">
            <video ref={videoRef} style={{ display: "none" }}  />
            <canvas ref={canvasRef} className="video" />
        </div>



        <div className="controls">
            {/* last scan button - use a small version of the last photo */}
            {/* TODO: make clicking on this do something */}
            <Icon>
                {images.length > 0 && <img src={images[images.length - 1]} style={{ width: '2rem' }} />}
            </Icon>

            {/* capture button */}
            <Icon onClick={savePage}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                </svg>
            </Icon>


            {/* share/export button */}
            <Icon onClick={exportDocument}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15" />
                </svg>
            </Icon>
        </div>





    </div>
}

function Icon(props) {
    return <span className="icon" {...props}>
        {props.children}
    </span>
}