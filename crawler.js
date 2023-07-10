const http = require("http");
const cheerio = require("cheerio");
const superagent = require("superagent");
require("superagent-proxy")(superagent);
const fs = require("fs");
const { randomUserAgent, referer, delay } = require("./utils");
/*
 * 杜绝反爬虫机制
 * 把所有链接存到一个数组，然后随机的隔一段时间爬取
 * */
// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // 处理请求
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("Hello, World!");
});

// 监听指定端口
const port = 1234;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
const proxyUrl = "http://proxy.example.com:8080";
const domain = "https://xc8866.com/";
const result = [];
const failUrlList = [];
const getLoufengList = ($) => {
  const items = $(
    "div.row > div.main > div.card.card-threadlist > div.card-body > ul.threadlist > li.media",
  );
  const loufengList = [];
  // console.log(items)
  items.each((index, item) => {
    const title = $(item).find(".subject_body .subject >a").eq(0).text();
    const city = $(item).find(".subject_body .subject >a").eq(1).text();
    const href = $(item).find(".subject_body .subject >a").attr("href");
    const avatar = $(item).find(".subject_body .my-2 >a >img").attr("src");
    const author = $(item).find(".subject_body .my-2 >a.username").text();
    const timeSpan = $(item).find(".subject_body .my-2 >.date").text();
    const cover = $(item).find(".subject_body .subject_body_img").attr("src");
    const brief = $(item).find(".subject_body .threadlist_brief").text();
    const area = $(item).find(".subject_body .thread-forum-name>span").text();
    const itemObj = {
      title,
      city,
      href,
      avatar,
      author,
      timeSpan,
      cover,
      brief,
      area,
    };
    loufengList.push(itemObj);
  });

  return loufengList;
};
const superagentPromise = (url) => {
  return new Promise((resolve, reject) => {
    superagent
      .get(url)
      // .proxy(proxyUrl)
      .set("Accept", "text/html")
      .set("Referer", referer)
      .set("User-Agent", randomUserAgent())
      .end((err, res) => {
        resolve([err, res]);
      });
  });
};

async function run() {
  const resArr = await superagentPromise(domain);
  const err = resArr[0];
  const res = resArr[1];
  if (err) {
    console.error("请求出错");
    return;
  }
  // console.log('响应结果:', res.text);
  const $ = cheerio.load(res.text);
  result.push({
    title: "最新",
    list: getLoufengList($),
  });
  let provinceLinks = $("#v-pills-tab .forumList li .nav-link").map(
    (index, item) => {
      return {
        provinceUrl: $(item).attr("href"),
        provinceTitle: $(item).text(),
      };
    },
  );
  provinceLinks = [...provinceLinks];
  console.log("provinceLinks.length", provinceLinks.length);
  let provinceIndex = 0; //省份请求完成+1
  let totalCount = 0; //省份跟省份下城市全部请求完成+1
  const pInterval = setInterval(async () => {
    if (provinceIndex === provinceLinks.length) {
      // console.log('provinceLinks.length finished', provinceLinks.length);
      clearInterval(pInterval);
      return;
    }
    const provinceUrl = provinceLinks[provinceIndex].provinceUrl;
    const provinceTitle = provinceLinks[provinceIndex].provinceTitle;
    console.log(provinceTitle);
    const resArr = await superagentPromise(domain + provinceUrl);
    const err = resArr[0];
    const res = resArr[1];

    if (err) {
      console.log("failUrl", domain + provinceUrl);
      // 失败了把你放回去排到后面继续请求
      provinceLinks.push({
        provinceUrl,
        provinceTitle,
      });
      return;
    }
    const $ = cheerio.load(res.text);

    const provinceObj = {
      title: provinceTitle,
      list: getLoufengList($),
      children: [],
    };
    result.push(provinceObj);
    let cityLinks = $(".card-body .nav_tag_list td>a").map((index, item) => {
      return {
        cityUrl: $(item).attr("href"),
        cityTitle: $(item).text(),
      };
    });
    cityLinks = [...cityLinks];
    let cityIndex = 0;
    let count = 0;
    const cInterval = setInterval(async () => {
      if (cityIndex === cityLinks.length) {
        clearInterval(cInterval);
        return;
      }
      const cityUrl = cityLinks[cityIndex].cityUrl;
      const cityTitle = cityLinks[cityIndex].cityTitle;
      const resArr = await superagentPromise(domain + cityUrl);
      const err = resArr[0];
      const res = resArr[1];

      count++;
      if (err) {
        console.log("failCityUrl", domain + cityUrl);
        cityLinks.push({
          cityUrl,
          cityTitle,
        });
        return;
      }

      const $ = cheerio.load(res.text);
      provinceObj.children.push({
        title: cityTitle,
        list: getLoufengList($),
      });
      if (count === cityLinks.length) {
        // 判断这个省份下的城市是否全部请求完成
        totalCount++;
        if (totalCount === provinceLinks.length) {
          getDetail(result);
          /*const jsonData = JSON.stringify(result);
          fs.writeFile("crawler3.json", jsonData, "utf8", (err) => {
            if (err) {
              console.error("保存文件时出错：", err);
            } else {
              console.log("JSON 数据已成功保存到文件。");
            }
          });*/
        }
      }
      cityIndex++;
    }, 10000);
    provinceIndex++;
  }, 1000);
}

run().then((r) => {});

let total = 0;
function getTotal(result) {
  total += result.length;
  for (const obj of result) {
    if (obj.children) {
      total += obj.children;
      getTotal(obj.children);
    }
  }
  return total;
}

const totalCount = getTotal(result);
let totalCountFlag = 0;
//获取每一条的点进去的详情
function getDetail(data) {
  let index = 0;

  const intervel = setInterval(async () => {
    const item = data[index];
    if (index === data.length) {
      totalCountFlag++;
      if (totalCountFlag === totalCount) {
        //表示全部查完,执行存储操作
        const jsonData = JSON.stringify(data);
        fs.writeFile("crawler3.json", jsonData, "utf8", (err) => {
          if (err) {
            console.error("保存文件时出错：", err);
          } else {
            console.log("JSON 数据已成功保存到文件。");
          }
        });
      }
      clearInterval(intervel);
      return;
    }
    if (item.children) {
      getDetail(item.children);
    }
    async function getTail(itemParam) {
      const resArr = await superagentPromise(domain + itemParam.href);
      const err = resArr[0];
      const res = resArr[1];
      if (err) {
        console.error("请求详情出错", domain + itemParam.href);
        await getTail(itemParam);
        return;
      }
      index++; //请求成功 +1
      const $$ = cheerio.load(res.text);
      /*
       * 补充一些从dom里拿字段的操作
       * */
      itemParam.detail = res.text;
    }
    getTail(item).finally(() => {});
  }, 10000);
}
