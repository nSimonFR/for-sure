# Args: import_id, account_name
import_id = ARGV[0]
account_name = ARGV[1]
imp = Import.find(import_id)
account = Account.find_by!(name: account_name)
Import::AccountMapping.find_or_create_by!(import: imp, key: "") { |m| m.mappable = account }
imp.import!
imp.update!(status: :complete)
imp.family.sync_later
puts "STATUS=#{imp.reload.status}"
