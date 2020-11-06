const neo4j = require("neo4j-driver");
const driver = neo4j.driver(
  process.env.NEO4J_URL,
  neo4j.auth.basic("neo4j", process.env.NEO4J_AUTH)
);
const session = driver.session();
const { MongoClient, ObjectId } = require("mongodb");

const datas = [
  { words: ["a", "b", "c", "d", "e"] },
  { words: ["a", "f", "u", "g", "x"] },
  { words: ["b", "k", "l", "m"] },
  { words: ["u", "c", "d", "k"] },
  { words: ["j", "z", "s", "p"] },
];

(async () => {
  const client = await MongoClient.connect(process.env.MONGODB_URL);
  await session.run("MATCH (n) DETACH DELETE n");
  await session.run(
    "CREATE INDEX WORD IF NOT EXISTS FOR (n :UniqueKeyword) ON (n.word)"
  );

  try {
    const mongo = client.db(process.env.MONGODB_DB);
    let count = 0;
    while (true) {
      let data = await getData(mongo, count);
      if (!data) break;
      /**
       * data format
       * [{
          _id: 5f981d232dae3da873e30701,
          words: [
            '총기',     '포함', '닉네임',    '블랙',
            '사이즈',    '도둑', '실측',     '맥도날드',
            '여부',     '보관', '인하',     '브랜드',
            '브랜디드',   '케첩', '편의점',    '붙여져잇',
            '사항',     '소매', '색상',     '가슴',
            '수선',     '택배', '선불/착불/', '특이',
            '흑청데님자켓', '가격', '어깨'
          ]
        }]
       */
      console.log(data[0]);
      count++;
      await insertNeo4j(session, data[0]);
      // break;
    }
  } catch (error) {
    console.log(error);
  } finally {
    await session.close();
  }

  // on application exit:
  await driver.close();
  await client.close();
})();

async function getData(mongo, count) {
  try {
    return await mongo
      .collection("Keyword")
      .aggregate(
        [
          {
            $project: {
              monitoringDataId: 1,
              word: 1,
            },
          },
          {
            $group: {
              _id: "$monitoringDataId",
              words: { $push: "$word" },
            },
          },
          { $skip: count || 0 },
          {
            $limit: 1,
          },
        ]
        // { allowDiskUse: true }
      )
      .toArray();
  } catch (error) {
    throw new Error(error.message);
  }
}

async function insertNeo4j(session, post) {
  try {
    await session.run(
      `
    UNWIND $words AS word 
    MERGE (n :UniqueKeyword { word: word })
    ON CREATE SET n.count = 1
    ON MATCH SET n.count = n.count + 1
    `,
      {
        words: post.words,
      }
    );

    for (let i = 0; i < post.words.length; i++) {
      const copy = JSON.parse(JSON.stringify(post.words));
      copy.splice(0, i + 1);
      await session.run(
        `
        UNWIND $words AS word
        MATCH (i :UniqueKeyword {word: $targetWord}), (j :UniqueKeyword {word: word})
        MERGE (i) -[r:SAME_POST]- (j)
        ON CREATE SET r.count = 1
        ON MATCH SET r.count = r.count + 1
        `,
        {
          targetWord: post.words[i],
          words: copy,
        }
      );
    }
  } catch (error) {
    throw new Error(error.message);
  }
}
