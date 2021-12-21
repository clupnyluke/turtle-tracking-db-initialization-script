import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { node_ping_entries, PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function stringArrToInt(stringArr: string[]) {
    return Number.parseInt(stringArr.join(""));
}

function spliceToNextDelimitingStr(arr: string[], str: string) {
    return arr.splice(0, arr.indexOf(str));
}

let i = 0;
const tags: string[] = [];
const nodes: string[] = [
    "368413",
    "368506",
    "33a471",
    "363b22",
    "33c865",
    "33dbdf",
];
prisma.tags
    .findMany()
    .then((tag_data) => tag_data.forEach((data) => tags.push(data.id)))
    .then(async () => {
        const csvDirPath = path.join(__dirname, "..", "Turtle tag data", "csv");
        const csvDir = fs.readdirSync(csvDirPath);
        for (const csvFile in csvDir) {
            const csvFileText = fs.readFileSync(
                path.join(csvDirPath, csvDir[csvFile])
            );
            console.log(csvDir[csvFile]);
            const csvObject = parse(csvFileText) as string[][];
            const labels = csvObject.shift();
            const indices = {
                epoch: labels?.indexOf("Time"),
                signal_strength__rssi_: labels?.indexOf("TagRSSI"),
                tag_id: labels?.indexOf("TagId"),
                node_id: labels?.indexOf("NodeId"),
            };
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
                    date.setFullYear(
                        year < 2000 ? year + 2000 : year,
                        month,
                        day
                    );
                    date.setHours(hour, minutes, seconds);
                    dataRaw.epoch = date.valueOf() / 1000;
                    dataRaw.signal_strength__rssi_ = Number.parseInt(
                        dataRaw.signal_strength__rssi_.toString()
                    );
                    if (Object.values(dataRaw).every((val) => val)) {
                        if (tags.includes(dataRaw.tag_id.toString())) {
                            if (nodes.includes(dataRaw.node_id.toString())) {
                                const data: node_ping_entries = {
                                    unique_id: i++,
                                    epoch: Math.floor(dataRaw.epoch),
                                    signal_strength__rssi_:
                                        dataRaw.signal_strength__rssi_,
                                    node_id: dataRaw.node_id.toString(),
                                    tag_id: dataRaw.tag_id.toString(),
                                };
                                await prisma.node_ping_entries
                                    .create({
                                        data,
                                    })
                                    .then((out) => console.log(out));
                            }
                        } else {
                            await prisma.tags
                                .create({
                                    data: { id: dataRaw.tag_id.toString() },
                                })
                                .then((result) => console.log(result));
                            tags.push(dataRaw.tag_id.toString());
                        }
                    }
                }
            }
        }
    });
