-- Neovim LSP configuration for Morpheus Script
-- Add this to your Neovim configuration (init.lua or lua/lspconfig.lua)

local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

-- Define the Morpheus language server configuration
if not configs.morpheus_lsp then
  configs.morpheus_lsp = {
    default_config = {
      cmd = { 'morpheus-lsp', '--stdio' },
      filetypes = { 'morpheus', 'scr' },
      root_dir = function(fname)
        return lspconfig.util.find_git_ancestor(fname) or vim.fn.getcwd()
      end,
      single_file_support = true,
      settings = {
        morpheus = {
          gameVersion = { 'AA', 'SH', 'BT' },
        },
      },
    },
    docs = {
      description = [[
        Morpheus Script language server for MOHAA scripting.

        Install via npm:
        npm install -g morpheus-lsp

        Or with pnpm:
        pnpm add -g morpheus-lsp
      ]],
    },
  }
end

-- Setup the language server
lspconfig.morpheus_lsp.setup({
  on_attach = function(client, bufnr)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[bufnr].omnifunc = 'v:lua.vim.lsp.omnifunc'

    -- Buffer local mappings
    local opts = { buffer = bufnr }
    vim.keymap.set('n', 'gD', vim.lsp.buf.declaration, opts)
    vim.keymap.set('n', 'gd', vim.lsp.buf.definition, opts)
    vim.keymap.set('n', 'K', vim.lsp.buf.hover, opts)
    vim.keymap.set('n', 'gi', vim.lsp.buf.implementation, opts)
    vim.keymap.set('n', '<C-k>', vim.lsp.buf.signature_help, opts)
    vim.keymap.set('n', 'gr', vim.lsp.buf.references, opts)
    vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, opts)
    vim.keymap.set({ 'n', 'v' }, '<leader>ca', vim.lsp.buf.code_action, opts)
  end,
  capabilities = require('cmp_nvim_lsp').default_capabilities(),
})

-- Register .scr file type
vim.filetype.add({
  extension = {
    scr = 'morpheus',
  },
})
