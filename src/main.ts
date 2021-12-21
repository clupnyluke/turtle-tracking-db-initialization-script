/* 
This script was designed to parse many csv files and put the data into a pgsql server for easier manipulation
and retrieval
By: Lucas Clupny
*/

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { node_ping_entries, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* function to take a array of characters that are integers
and convert them to one integer */
function stringArrToInt(stringArr: string[]) {
    return Number.parseInt(stringArr.join(""));
}

/* function to splice to a delimiting character in a char array
honestly ended up being unnecessary but you live and learn */
function spliceToNextDelimitingStr(arr: string[], str: string) {
    return arr.splice(0, arr.indexOf(str));
}

let i = 0; // this is a unique identifier for the entries in pgsql table
const tags: string[] = []; //will hold tags that are identified
const nodes: string[] = [
    "368413",
    "368506",
    "33a471",
    "363b22",
    "33c865",
    "33dbdf",
]; //current list of valid nodes

// First we will extract the valid tags in the database
// after we begin the main logic of the program
// honstly should have extracted just hardcoded them like the node ids
prisma.tags
    .findMany()
    .then((tag_data) => tag_data.forEach((data) => tags.push(data.id)))
    .then(async () => {
        // grab the csv's from directory ../Turtle tag data/csv/
        const csvDirPath = path.join(__dirname, "..", "Turtle tag data", "csv");
        const csvDir = fs.readdirSync(csvDirPath);
        for (const csvFile in csvDir) {
            const csvFileText = fs.readFileSync(
                path.join(csvDirPath, csvDir[csvFile])
            );
            const csvObject = parse(csvFileText) as string[][];
            //labeles for each column
            const labels = csvObject.shift();
            //the indices we are interested in
            const indices = {
                epoch: labels?.indexOf("Time"),
                signal_strength__rssi_: labels?.indexOf("TagRSSI"),
                tag_id: labels?.indexOf("TagId"),
                node_id: labels?.indexOf("NodeId"),
            };
            // if our indices we want exist parse
            if (Object.values(indices).indexOf(undefined) === -1) {
                for (const row in csvObject) {
                    const rowData = csvObject[row];
                    const dataRaw: { [x: string]: string | number } = {};
                    Object.entries(indices).forEach((entry) => {
                        dataRaw[entry[0]] = rowData[entry[1] ?? NaN];
                    });
                    // fixing epoch time from human readable
                    // MM/DD/YYYY HH:MM:SS
                    const dateTime = dataRaw.epoch.toString().split("");
                    //this function will extract the data from the document
                    // and make a number up to the next delimiting character
                    // lastly splice the character from the array
                    const extractNextTimeElement = (char: string) => {
                        const out = stringArrToInt(
                            spliceToNextDelimitingStr(dateTime, char)
                        );
                        dateTime.shift();
                        return out;
                    };
                    const month = extractNextTimeElement("/") - 1;
                    const day = extractNextTimeElement("/");
                    const year = extractNextTimeElement(" ");
                    const hour = extractNextTimeElement(":");
                    const minutes = dateTime.includes(":")
                        ? extractNextTimeElement(":")
                        : stringArrToInt(dateTime);
                    const seconds = stringArrToInt(dateTime) ?? 0;
                    const date = new Date();
                    //year format in document varies between 2 and 4 number display
                    date.setFullYear(
                        year < 2000 ? year + 2000 : year,
                        month,
                        day
                    );
                    date.setHours(hour, minutes, seconds);
                    //convert from ms to s epoch
                    dataRaw.epoch = date.valueOf() / 1000;
                    dataRaw.signal_strength__rssi_ = Number.parseInt(
                        dataRaw.signal_strength__rssi_.toString()
                    );
                    // make sure our target indices exist in the object
                    if (Object.values(dataRaw).every((val) => val)) {
                        // check that the tag exists
                        if (tags.includes(dataRaw.tag_id.toString())) {
                            // check that the node is also valid
                            if (nodes.includes(dataRaw.node_id.toString())) {
                                const data: node_ping_entries = {
                                    unique_id: i++,
                                    epoch: Math.floor(dataRaw.epoch),
                                    signal_strength__rssi_:
                                        dataRaw.signal_strength__rssi_,
                                    node_id: dataRaw.node_id.toString(),
                                    tag_id: dataRaw.tag_id.toString(),
                                };
                                //create entry in db
                                await prisma.node_ping_entries
                                    .create({
                                        data,
                                    })
                                    .then((out) => console.log(out));
                            }
                        }
                    }
                }
            }
        }
    });
