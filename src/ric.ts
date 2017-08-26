// Import TypeScript modules
import * as shelljs from 'shelljs'
import * as _ from 'lodash'
import * as fs from 'fs'
import * as chalk from 'chalk'
import * as ora from 'ora'
import * as os from 'os'
import * as path from 'path'
import {URL} from 'url'
import * as program from 'commander'

// Import untyped JavaScript files
const Github = require('github-api')

// Initialize shell ouput coloring functions
const name = chalk.italic.blue
const error = chalk.bold.underline.red

// Constants
const pullRequestUrlRegex = /\/pull\/\d+/g
const pathnameParsingRegex = /^\/(.+?)\/(.+?)(?:\/|$)(?:pull\/(\d+))?/
const cwd = process.cwd()
const {VIC_EDITOR_COMMAND = 'code --wait'} = process.env

// Application spinner
const applicationSpinner = ora()

// Setup arguments through the commander.js CLI framework
program
  .usage('[options] <GitHub repo or pull-request URL>')
  .option(
    '-d, --deep [boolean]', 
    'Specify whether to clone repos deep or shallow. By default PRs are ' +
    'cloned with full depth and repos are cloned with depth level of 1.'
  )
  .parse(process.argv)

// If user doesn't provide any arguments, we'll display help
if (!program.args.length) {
  program.outputHelp()
  shelljs.exit(1)
}

// Kick off the program
main()

// Main function
async function main() {
  try {
    const [src] = program.args
    const {pathname} = new URL(src)
    const isPr = checkIsPr(pathname)
    const {deep: isDeep = isPr ? true : false} = program
    const [,
      srcUser = '', 
      srcRepoName = '',
      prNumber = '0'
    ] = pathname.match(pathnameParsingRegex) || []
    const srcRepoFullName = `${srcUser}/${srcRepoName}`
    const userFriendlyName = (isPr) ? `${srcRepoFullName}#${prNumber}` : srcRepoFullName
    const dirName = path.join(os.tmpdir(), `ric-${srcRepoName}-${Date.now()}`)
  
    fs.mkdirSync(dirName)
    applicationSpinner.succeed(`Files will temporarily reside in ${name(dirName)}`)
  
    let repoUrl = `https://github.com/${srcRepoFullName}`
    let branch = 'master'
    
    if (isPr) {
      const gh = new Github()
      const repo = gh.getRepo(srcUser, srcRepoName)
      applicationSpinner.start(`Retrieving PR info ${name(userFriendlyName)}`)
      const pr = await repo.getPullRequest(prNumber)
      const prRepo = _.get(pr, 'data.head', {})
      const prRepoName = _.get(prRepo, 'repo.name', '')
      const [prUser, prBranch] = _.get(prRepo, 'label', '').split(':')
  
      branch = prBranch
      repoUrl = `https://github.com/${prUser}/${prRepoName}`
    }
    
    shelljs.cd(dirName)
    
    applicationSpinner.start(`Cloning ${name(`${repoUrl}`)} into temporary directory`)
    await exec(`GIT_TERMINAL_PROMPT=0 git clone ${(isDeep) ? '' : '--depth 1 '}${repoUrl} .`)
  
    applicationSpinner.start(`Checking out ${name(branch)}`)
    await exec(`git checkout ${branch}`)
  
    shelljs.cd(cwd)
    
    applicationSpinner.stop()
    
    const reviewingRepoSpinner = ora({
      text: `Reviewing ${name(userFriendlyName)} in editor`, 
      spinner: {frames: ['📖 ']}
    }).start()
    await exec(`${VIC_EDITOR_COMMAND} ${dirName}`)
    reviewingRepoSpinner.succeed(`Done reviewing ${name(userFriendlyName)}`)
  } catch(err) {
    console.error(error('\n\nAn error occurred:\n'))
    console.log(err.stack ? err.stack : err)
    shelljs.exit(1)
  }
}

function exec(str: string) {
  return new Promise((resolve, reject) => shelljs.exec(
    str, 
    {silent: true}, 
    (code: number, _1, errorMsg) => {
      if (code === 0) {
        resolve()
      } else {
        console.log(errorMsg)
        reject(errorMsg)
      }
    }
  ))
}

function checkIsPr(pathname: string) {
  return pullRequestUrlRegex.test(pathname)
}