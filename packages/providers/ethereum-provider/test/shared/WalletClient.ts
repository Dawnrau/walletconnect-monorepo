import { ethers } from "ethers";
import WalletConnect from "@walletconnect/client";
import { IConnector } from "@walletconnect/types";

import WCEthereumProvider from "../../src";
export interface WalletClientOpts {
  privateKey: string;
  chainId: number;
  rpcUrl: string;
}

export class WalletClient {
  readonly provider: WCEthereumProvider;
  readonly signer: ethers.Wallet;
  readonly chainId: number;
  readonly rpcUrl: string;

  client?: IConnector;

  constructor(provider: WCEthereumProvider, opts: Partial<WalletClientOpts>) {
    this.provider = provider;
    console.log(opts); // eslint-disable-line
    const wallet = opts.privateKey
      ? new ethers.Wallet(opts.privateKey)
      : ethers.Wallet.createRandom();
    this.chainId = opts?.chainId || 123;
    console.log(this.chainId); // eslint-disable-line
    this.rpcUrl = opts?.rpcUrl || "http://localhost:8545";
    console.log(this.rpcUrl); // eslint-disable-line
    this.signer = wallet.connect(new ethers.providers.JsonRpcProvider(this.rpcUrl));
    console.log(this.signer); // eslint-disable-line
  }

  approveSessionAndRequest() {
    return new Promise<void>(async (resolve, reject) => {
      await this.approveSession();
      if (!this.client) throw Error("Client(session) needs to be initiated first");
      this.client.on("call_request", async (error, payload) => {
        if (!this.client) throw Error("Client(session) needs to be initiated first");
        if (error) {
          reject(error);
        }

        if (payload.method === "eth_sendTransaction") {
          try {
            let transactionObject: ethers.providers.TransactionRequest = {
              from: payload.params[0].from,
              data: payload.params[0].data,
              chainId: this.chainId,
            };
            if (payload.params[0].gas) {
              transactionObject = {
                ...transactionObject,
                gasLimit: payload.params[0].gas,
              };
            }
            if (payload.params[0].to) {
              transactionObject = {
                ...transactionObject,
                to: payload.params[0].to,
              };
            }
            const tx = await this.signer.sendTransaction(transactionObject);
            await tx.wait();
            this.client.approveRequest({
              id: payload.id,
              result: tx.hash,
            });
            resolve();
          } catch (error) {
            await this.client.rejectRequest({
              id: payload.id,
              error: {
                message: "message" in error ? error.message : JSON.stringify(error),
              },
            });
          }
        }
        if (payload.method === "eth_sign") {
          try {
            const sign = await this.signer.signMessage(payload.params[1]);
            // console.log("signing at client");
            // console.log();
            // console.log("msg at clien,", payload.params[1]);
            // console.log("sig at client", sign);
            this.client.approveRequest({
              id: payload.id,
              result: sign,
            });
            resolve();
          } catch (error) {
            throw error;
          }
        }
        if (payload.method === "eth_signTransaction") {
          try {
            const signedTx = await this.signer.signTransaction(payload.params[0]);
            // console.log("signing at client");
            // console.log();
            // console.log("msg at clien,", payload.params[1]);
            // console.log("sig at client", sign);
            this.client.approveRequest({
              id: payload.id,
              result: signedTx,
            });
            resolve();
          } catch (error) {
            throw error;
          }
        }
        if (payload.method === "eth_sendRawTransaction") {
          try {
            const hash = await this.provider.request<string>(payload);
            // console.log("signing at client");
            // console.log();
            // console.log("msg at clien,", payload.params[1]);
            // console.log("sig at client", sign);
            this.client.approveRequest({
              id: payload.id,
              result: hash,
            });
            resolve();
          } catch (error) {
            throw error;
          }
        }
      });
    });
  }

  // listen() {
  //   return new Promise<void>(async (resolve, reject) => {
  //     if (!this.client) throw Error("Client(session) needs to be initiated first");
  //     this.client.on("session_request", error => {
  //       if (!this.client) throw Error("Client(session) needs to be initiated first");
  //       if (error) {
  //         reject(error);
  //       }
  //       this.client.approveSession({
  //         accounts: [this.signer.address],
  //         chainId: this.chainId,
  //       });
  //     });

  //     this.client.on("disconnect", async error => {
  //       if (error) {
  //         reject(error);
  //       }
  //       resolve();
  //     });
  //   });
  // }

  approveSession() {
    return new Promise<void>((resolve, reject) => {
      this.provider.connector.on("display_uri", (error, payload) => {
        if (error) {
          reject(error);
        }
        const uri = payload.params[0];
        this.client = new WalletConnect({ uri });
        this.client.on("session_request", (error, payload) => {
          if (!this.client) throw Error("Client(session) needs to be initiated first");
          if (error) {
            reject(error);
          }
          if (payload.params[0].chainId !== this.chainId) {
            return reject(new Error("Invalid chainid for session request"));
          }
          const session = { accounts: [this.signer.address], chainId: this.chainId };
          this.client.approveSession(session);
          resolve();
        });
      });
    });
  }
}
