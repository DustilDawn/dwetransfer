import Head from "next/head";
import Image from "next/image";
import { Inter } from "@next/font/google";
import styles from "@/styles/Home.module.css";
import { useEffect, useRef, useState } from "react";
import lighthouse from "@lighthouse-web3/sdk";
import Lottie from "lottie-react";
import celebrateLottie from "./celebrate.json";
import { ethers } from "ethers";
import { entropyToMnemonic } from "@ethersproject/hdnode";
import { Client } from "@xmtp/xmtp-js";
import { toast, Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

// get human readable file size
const humanFileSize = (size) => {
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (
    (size / Math.pow(1024, i)).toFixed(2) * 1 +
    " " +
    ["B", "kB", "MB", "GB", "TB"][i]
  );
};

export default function Home() {
  const formRef = useRef(null);

  const [runOnce, setRunOnce] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [step, setStep] = useState(1);
  const [walletAddress, setWalletAddress] = useState(null);
  const [fileInput, setFile] = useState(null);
  const [percentageDone, setPercentageDone] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [currentUploaded, setCurrentUploaded] = useState(0);
  const [formData, setFormData] = useState(null);
  const [shareLink, setShareLink] = useState(null);

  // create a state to handle form error
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    const privateKey = localStorage.getItem("privateKey");
    const publicKey = localStorage.getItem("publicKey");

    if (!privateKey && !publicKey && !accountCreated) {
      createAccount();
      setShowMessage(true);
      return;
    }

    if (privateKey && publicKey && !showMessage && accountCreated) {
      setAccountCreated(true);
      setShowMessage(false);
      return;
    }
  }, []);

  async function close() {
    setShowMessage(false);
  }

  async function createAccount() {
    // create a random mnemonic
    const mnemonic = entropyToMnemonic(ethers.utils.randomBytes(16));

    // create a wallet using the mnemonic
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);

    // get the private key
    const privateKey = wallet.privateKey;

    // get the public key
    const publicKey = wallet.address;

    // save the private key and public key to local storage
    localStorage.setItem("privateKey", privateKey);

    localStorage.setItem("publicKey", publicKey);
  }

  const encryptionSignature = async () => {
    // get the private key from local storage
    const privateKey = localStorage.getItem("privateKey");

    // get wallet
    const wallet = new ethers.Wallet(privateKey);

    const address = await wallet.getAddress();
    const messageRequested = (await lighthouse.getAuthMessage(address)).data
      .message;
    const signedMessage = await wallet.signMessage(messageRequested);
    return {
      signedMessage: signedMessage,
      publicKey: address,
    };
  };

  async function copy() {
    navigator.clipboard.writeText(shareLink);

    toast.success("Link copied to clipboard");
  }

  const signAuthMessage = async (publicKey, privateKey) => {
    const provider = new ethers.providers.JsonRpcProvider();
    const signer = new ethers.Wallet(privateKey, provider);
    const messageRequested = (await lighthouse.getAuthMessage(publicKey)).data
      .message;
    const signedMessage = await signer.signMessage(messageRequested);
    return signedMessage;
  };

  async function backup() {
    // backup the private key from local storage
    const privateKey = localStorage.getItem("privateKey");

    // let user download it
    const element = document.createElement("a");
    const file = new Blob([privateKey], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = "dwetransfer-privateKey.txt";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(formRef.current);

    setFormData(formData);

    // console.log("form data: ", formData);

    // get the file
    const file = formData.get("file");

    // get file name
    const fileName = file.name;

    const binaryData = await file.arrayBuffer();

    const base64Data = btoa(
      new Uint8Array(binaryData).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );

    // check if file is empty
    if (base64Data === "") {
      toast.error("Please select a file");
      return;
    } else {
      setFormError(null);
    }

    // get the file size
    const size = formData.get("file").size;

    console.log("file size: ", humanFileSize(size));

    // get the wallet address
    const walletAddress = formData.get("walletAddress");
    setWalletAddress(walletAddress);
    // console.log("wallet address: ", walletAddress);

    // check if is a valid ethereum address using ethers
    const { isAddress } = require("@ethersproject/address");

    if (!isAddress(walletAddress)) {
      toast.error("Please enter a valid ethereum address");
      return;
    } else {
      setFormError(null);
    }

    // get the title
    const title = formData.get("title");

    // check if title is empty
    if (title === "") {
      toast.error("Please enter a title");
      return;
    } else {
      setFormError(null);
    }

    // get the message
    const message = formData.get("message");

    // check if message is empty
    if (message === "") {
      toast.error("Please enter a message");
      return;
    } else {
      setFormError(null);
    }

    // create a new form data
    console.log(`
      walletAddress: ${walletAddress}
      title: ${title}
      message: ${message}
    `);

    // go to step 2
    setStep(2);

    // return;
    const sig = await encryptionSignature();

    var uploadResponse;

    uploadResponse = await lighthouse.uploadEncrypted(
      fileInput,
      sig.publicKey,
      "3ed35461-c7f8-47b3-b6e7-4a0a9a04b06c",
      sig.signedMessage,
      async (progressData) => {
        const percentageDone =
          100 - (progressData?.total / progressData?.uploaded)?.toFixed(2);

        const { progress, total, uploaded } = progressData;

        // progress: 1 total: 1741224 uploaded: 1741224
        console.log(
          `progress: ${progress} total: ${total} uploaded: ${uploaded}`
        );
        console.log("percentage done: ", percentageDone);

        // round the percentage done
        const rounded = Math.round(percentageDone);

        setPercentageDone(rounded);
        setCurrentUploaded(progressData?.uploaded);
        setTotalSize(progressData?.total);

        if (
          percentageDone === 99 &&
          progressData?.total === progressData?.uploaded
        ) {
          console.log("upload complete");

          await new Promise((resolve) => setTimeout(resolve, 2000));

          setStep(3);
        }
      }
    );

    console.log("upload response: ", uploadResponse);
    const cid = uploadResponse.data.Hash;

    const link = `https://files.lighthouse.storage/viewFile/${cid}`;
    console.log("link:", link);
    setShareLink(link);

    console.log("walletAddress:", walletAddress);

    const privateKey = localStorage.getItem("privateKey");
    const publicKey = localStorage.getItem("publicKey");
    const signedMessage = await signAuthMessage(publicKey, privateKey);

    const res = await lighthouse.shareFile(
      publicKey,
      [walletAddress],
      cid,
      signedMessage
    );

    console.log("share file response: ", res);

    const shareLink = `https://files.lighthouse.storage/viewFile/${res.data.cid}`;

    // get wallet
    const wallet = new ethers.Wallet(privateKey);

    const xmtp = await Client.create(wallet, {
      env: "production",
    });

    const conversation = await xmtp.conversations.newConversation(
      walletAddress
    );

    // create a message with the file name, size, message and download link
    const msg = `
      Sent from DWETransfer => 1 file: ${fileName} | ${humanFileSize(size)}
      | ${title}: ${message}
      | Download link: ${shareLink}
      | https://dwetransfer.vercel.app/
      `;

    await conversation.send(msg);
  }
  return (
    <>
      <Head>
        <title>Decentralized We Transfer</title>
        <meta name="description" content="Decentralized We Transfer" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="logo">
        <img src="/logo.png" alt="logo" className="logo" />
      </div>
      {showMessage ? (
        <div id="account" className="account">
          {/* create a svg close button */}
          <div onClick={close} className="close">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="feather feather-x"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>

          <h3>Account Generated!</h3>
          <p>
            We've automatically generated and saved your account inside the
            browser.
          </p>

          <button onClick={backup}>Backup Private Key</button>
        </div>
      ) : (
        ""
      )}

      <main id="main" className={styles.main}>
        <div
          className={`${styles.center} ${step === 3 ? styles.cardActive : ""} ${
            showMessage ? "hide-padding" : ""
          }`}
        >
          <div className={`${styles.card} `}>
            {/* only show this if step 1 */}

            {step === 1 ? (
              <div className="step">
                <h2 className={inter.className}>
                  Transfer a file <span>-&gt;</span>
                </h2>
                <p className={inter.className}>
                  Secure File Sharing: Exclusive Access for You & Recipient
                  {/* show form error */}
                  {formError && (
                    <div className={styles.error}>
                      <p>{formError}</p>
                    </div>
                  )}
                </p>
                <form
                  ref={formRef}
                  onSubmit={handleSubmit}
                  className={`${inter.className} ${styles.form}`}
                >
                  <input onChange={setFile} type="file" name="file" />
                  <input
                    type="text"
                    placeholder="Recipient Wallet Address"
                    name="walletAddress"
                  />
                  <input type="text" placeholder="Title" name="title" />
                  <textarea placeholder="Message" name="message" />
                  <button type="submit">Transfer</button>
                </form>
              </div>
            ) : (
              ""
            )}

            {/* step 2 */}
            {step === 2 ? (
              <div className="step">
                <svg viewBox="0 0 36 36" className={styles.circularChart}>
                  <path
                    className={styles.circleBg}
                    d="M18 2.0845
           a 15.9155 15.9155 0 0 1 0 31.831
           a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className={styles.circle}
                    strokeDasharray={`${percentageDone}, 100`}
                    d="M18 2.0845
           a 15.9155 15.9155 0 0 1 0 31.831
           a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <text x="24.35" y="17.35" className={styles.symbol}>
                    %
                  </text>
                  <text x="18" y="20.35" className={styles.percentage}>
                    {percentageDone}
                  </text>
                </svg>

                <h2 className={inter.className}>
                  Transferring <span>-&gt;</span>
                </h2>
                <p className={inter.className}>Sending 1 file to 1 person</p>

                <div className={styles.progress}>
                  <div className={styles.progressInner}></div>

                  {currentUploaded && totalSize ? (
                    <div className={inter.className}>
                      {humanFileSize(currentUploaded)} of{" "}
                      {humanFileSize(totalSize)} uploaded
                    </div>
                  ) : (
                    ""
                  )}
                </div>
              </div>
            ) : (
              ""
            )}

            {/* step 3 */}
            {step === 3 ? (
              <div className={`step3`}>
                <Lottie
                  className={styles.celebrateLottie}
                  animationData={celebrateLottie}
                  loop={true}
                />

                <h2
                  className={`${inter.className} ${styles.centerText} padding-top`}
                >
                  You're done!
                </h2>

                <div className="full-width">
                  {/* <p className={inter.className}>123</p> */}
                  <a
                    onClick={() => setStep(1)}
                    className={`${styles.link} ${styles.centerText}`}
                  >
                    Send another?
                  </a>
                </div>
              </div>
            ) : (
              ""
            )}
          </div>
        </div>
      </main>

      <div
        className={`${inter.className}  transfer-details ${
          step === 3 ? "active" : ""
        }`}
      >
        <h1>Your transfer details</h1>

        <div className="pt text">
          {humanFileSize(formData?.get("file")?.size)} |{" "}
          {formData?.get("file")?.name}
        </div>
        <div className="transfer-card">
          <h3 className="padding-top">Sending via XMTP</h3>
          <a
            className={`pt`}
            target="_blank"
            href={`https://xmtp.chat/dm/${walletAddress}`}
          >
            {walletAddress}
          </a>
        </div>
        <div className="transfer-card">
          <h3 className="padding-top">Title</h3>
          <p className="text pt">{formData?.get("title")}</p>
        </div>
        <div className="transfer-card">
          <h3 className="padding-top">Message</h3>
          <p className="text pt">{formData?.get("message")}</p>
        </div>
        <div className="transfer-card">
          <h3 className="padding-top">Sharable Link</h3>
          <p id="shareable-link" className="text pt">
            <textarea
              onClick={copy}
              id="shareable-link-textarea"
              value={shareLink}
              readOnly
            ></textarea>
          </p>
        </div>
      </div>
      <div className={`${inter.className}`}>
        <Toaster />
      </div>
    </>
  );
}
